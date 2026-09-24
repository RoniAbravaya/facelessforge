/**
 * Process Scheduled Posts - Queue worker that processes due scheduled posts.
 * Implements reliable publishing with retries, status tracking, and audit logging.
 * 
 * Should be triggered by a cron job every minute.
 */
import { createClient } from 'npm:@base44/sdk@0.8.6';
import { createRequestLogger, getUserFriendlyError } from './utils/logger.ts';
import { tiktokPublisher } from './publishers/tiktokPublisher.ts';
import type { Platform, PublishResult, ScheduledPostEntity, AuditLogEntity } from './publishers/types.ts';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [60, 300, 900]; // 1min, 5min, 15min (in seconds)

// Publisher registry - add new platforms here
const publishers = {
  tiktok: tiktokPublisher,
  // instagram: instagramPublisher,
  // youtube: youtubePublisher,
  // twitter: twitterPublisher,
};

async function createAuditLog(
  base44: any,
  entityType: string,
  entityId: string,
  action: string,
  actorType: 'user' | 'system' | 'webhook',
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await base44.entities.AuditLog.create({
      entity_type: entityType,
      entity_id: entityId,
      action,
      actor_type: actorType,
      metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

Deno.serve(async (req) => {
  const logger = createRequestLogger(req, 'processScheduledPosts');
  
  // Create Base44 client using environment variables (for cron/system calls)
  const appId = Deno.env.get('BASE44_APP_ID');
  const apiKey = Deno.env.get('BASE44_API_KEY') || Deno.env.get('BASE44_SERVICE_ROLE_KEY');
  
  if (!appId || !apiKey) {
    logger.error('Missing BASE44_APP_ID or BASE44_API_KEY environment variables');
    return Response.json({ error: 'Server configuration error' }, { status: 500 });
  }
  
  const base44 = createClient({
    appId,
    serviceRoleKey: apiKey,
  });

  try {
    const now = new Date();
    logger.info('Starting scheduled post processing', { timestamp: now.toISOString() });

    // Fetch posts that are due for publishing
    // Status = 'scheduled' AND scheduled_at <= now
    const duePosts = await base44.entities.ScheduledPost.filter({
      status: 'scheduled',
    });

    // Filter posts that are actually due (scheduled_at <= now)
    const postsToProcess = duePosts.filter((post: ScheduledPostEntity) => {
      const scheduledAt = new Date(post.scheduled_at);
      return scheduledAt <= now;
    });

    logger.info('Found posts to process', { 
      totalScheduled: duePosts.length,
      dueNow: postsToProcess.length 
    });

    // Also fetch failed posts that are due for retry
    const failedPosts = await base44.entities.ScheduledPost.filter({
      status: 'failed',
    });

    const postsToRetry = failedPosts.filter((post: ScheduledPostEntity) => {
      if (post.retry_count >= (post.max_retries || MAX_RETRIES)) return false;
      // Check if retry delay has passed
      const lastAttempt = new Date(post.updated_date || post.created_date);
      const retryDelay = RETRY_DELAYS[post.retry_count] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      const nextRetryAt = new Date(lastAttempt.getTime() + retryDelay * 1000);
      return nextRetryAt <= now;
    });

    logger.info('Found failed posts to retry', { count: postsToRetry.length });

    const allPosts = [...postsToProcess, ...postsToRetry];
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Process each post
    for (const post of allPosts) {
      const postLogger = logger.child({ postId: post.id, platform: post.platform });
      
      try {
        postLogger.info('Processing post', { 
          status: post.status, 
          retryCount: post.retry_count,
          scheduledAt: post.scheduled_at 
        });

        // Update status to publishing
        await base44.entities.ScheduledPost.update(post.id, {
          status: 'publishing',
        });

        await createAuditLog(base44, 'ScheduledPost', post.id, 'publish_started', 'system', {
          scheduledAt: post.scheduled_at,
          retryCount: post.retry_count,
        });

        // Get publisher for platform
        const publisher = publishers[post.platform as keyof typeof publishers];
        if (!publisher) {
          postLogger.error('Unsupported platform', null, { platform: post.platform });
          await base44.entities.ScheduledPost.update(post.id, {
            status: 'failed',
            error_message: `Unsupported platform: ${post.platform}`,
            error_code: 'UNSUPPORTED_PLATFORM',
            retry_count: MAX_RETRIES, // Don't retry
          });
          results.failed++;
          continue;
        }

        // Get access token for the user's social account
        let accessToken: string;
        try {
          // Assuming social accounts are linked via Base44 connectors
          accessToken = await base44.connectors.getAccessToken(post.platform);
        } catch (tokenError) {
          postLogger.error('Failed to get access token', tokenError);
          await base44.entities.ScheduledPost.update(post.id, {
            status: 'failed',
            error_message: 'Failed to get access token. Please reconnect your account.',
            error_code: 'AUTH_ERROR',
            retry_count: (post.retry_count || 0) + 1,
          });
          
          await createAuditLog(base44, 'ScheduledPost', post.id, 'publish_failed', 'system', {
            error: 'AUTH_ERROR',
            message: 'Failed to get access token',
          });
          
          results.failed++;
          continue;
        }

        // Publish
        const result: PublishResult = await publisher.publish({
          postId: post.id,
          platform: post.platform as Platform,
          videoUrl: post.video_url,
          caption: post.caption,
          privacyLevel: post.privacy_level,
          accessToken,
          metadata: post.metadata,
        });

        if (result.success) {
          postLogger.info('Post published successfully', { 
            platformPostId: result.platformPostId 
          });

          await base44.entities.ScheduledPost.update(post.id, {
            status: 'published',
            published_at: new Date().toISOString(),
            platform_post_id: result.platformPostId,
            platform_url: result.platformUrl,
            error_message: null,
            error_code: null,
          });

          await createAuditLog(base44, 'ScheduledPost', post.id, 'publish_succeeded', 'system', {
            platformPostId: result.platformPostId,
            platformUrl: result.platformUrl,
          });

          // Seed insights collection job (T+24h)
          try {
            await base44.entities.InsightJob.create({
              scheduled_post_id: post.id,
              platform: post.platform,
              platform_post_id: result.platformPostId,
              status: 'pending',
              scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // T+24h
              fetch_intervals: ['1h', '24h', '72h'],
            });
            postLogger.info('Insights job seeded');
          } catch (insightError) {
            postLogger.warn('Failed to seed insights job', { error: insightError.message });
          }

          results.succeeded++;

        } else {
          postLogger.error('Post publish failed', null, { 
            error: result.error,
            errorCode: result.errorCode,
            retryable: result.retryable 
          });

          const newRetryCount = (post.retry_count || 0) + 1;
          const shouldRetry = result.retryable && newRetryCount < MAX_RETRIES;

          await base44.entities.ScheduledPost.update(post.id, {
            status: shouldRetry ? 'failed' : 'failed', // Could use 'permanently_failed'
            error_message: result.error,
            error_code: result.errorCode,
            retry_count: newRetryCount,
          });

          await createAuditLog(base44, 'ScheduledPost', post.id, 'publish_failed', 'system', {
            error: result.error,
            errorCode: result.errorCode,
            retryable: result.retryable,
            retryCount: newRetryCount,
          });

          results.failed++;
          results.errors.push(`Post ${post.id}: ${result.error}`);
        }

        results.processed++;

      } catch (error) {
        postLogger.error('Unexpected error processing post', error);
        
        await base44.entities.ScheduledPost.update(post.id, {
          status: 'failed',
          error_message: getUserFriendlyError(error, 'Publishing'),
          retry_count: (post.retry_count || 0) + 1,
        });

        await createAuditLog(base44, 'ScheduledPost', post.id, 'publish_error', 'system', {
          error: error instanceof Error ? error.message : String(error),
        });

        results.failed++;
        results.errors.push(`Post ${post.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    logger.info('Scheduled post processing complete', results);

    return Response.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    });

  } catch (error) {
    logger.error('Fatal error in scheduled post processing', error);
    return Response.json({ 
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
