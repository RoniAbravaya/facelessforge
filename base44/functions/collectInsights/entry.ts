/**
 * collectInsights - Cron worker that collects analytics for published posts.
 * Runs on schedule (hourly) to fetch metrics at T+1h, T+24h, T+72h intervals.
 * Stores data in PostInsight entity for analytics dashboard.
 */
import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { base44 } from 'base44';
import { createRequestLogger, getUserFriendlyError } from './utils/logger.ts';

const app = new Hono();

// Insight collection intervals (in hours)
const COLLECTION_INTERVALS = [1, 24, 72];

interface InsightJob {
  id: string;
  scheduled_post_id: string;
  platform: string;
  platform_post_id: string;
  status: 'pending' | 'completed' | 'failed';
  scheduled_at: string;
  current_interval: number;
  fetch_intervals: number[];
  last_fetched_at?: string;
  error_message?: string;
}

interface ScheduledPost {
  id: string;
  platform: string;
  platform_post_id?: string;
  status: string;
  published_at?: string;
  video_url?: string;
  caption?: string;
}

interface SocialAccount {
  id: string;
  platform: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
}

interface PostInsight {
  id?: string;
  post_id: string;
  platform: string;
  platform_post_id: string;
  snapshot_at: string;
  interval_hours: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watch_time_avg: number;
  completion_rate: number;
  reach?: number;
  impressions?: number;
  raw_data?: Record<string, unknown>;
}

// Check if token needs refresh
function tokenNeedsRefresh(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  return now >= expiryTime - bufferTime;
}

// Refresh TikTok access token
async function refreshTikTokToken(
  refreshToken: string,
  logger: ReturnType<typeof createRequestLogger>
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  try {
    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');

    if (!clientKey || !clientSecret) {
      logger.error('TikTok client credentials not configured');
      return null;
    }

    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      logger.error('Token refresh failed', { status: response.status });
      return null;
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in
    };
  } catch (error) {
    logger.error('Token refresh error', error);
    return null;
  }
}

// Fetch insights from platform API
async function fetchInsightsFromPlatform(
  platform: string,
  platformPostId: string,
  accessToken: string,
  logger: ReturnType<typeof createRequestLogger>
): Promise<PostInsight | null> {
  try {
    // Call the fetchPostInsights function
    const baseUrl = Deno.env.get('BASE44_APP_BASE_URL') || 'https://base44.app';
    const appId = Deno.env.get('BASE44_APP_ID');

    const response = await fetch(`${baseUrl}/api/apps/${appId}/functions/fetchPostInsights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('BASE44_API_KEY')}`
      },
      body: JSON.stringify({
        platform,
        platform_post_id: platformPostId,
        access_token: accessToken
      })
    });

    if (!response.ok) {
      logger.error('Insights fetch failed', { status: response.status });
      return null;
    }

    const result = await response.json();
    if (!result.success || !result.insights) {
      logger.warn('No insights returned', { error: result.error });
      return null;
    }

    return {
      post_id: '',
      platform,
      platform_post_id: platformPostId,
      snapshot_at: new Date().toISOString(),
      interval_hours: 0,
      ...result.insights,
      raw_data: result.raw_response
    };
  } catch (error) {
    logger.error('Platform fetch error', error);
    return null;
  }
}

// Process a single insight job
async function processInsightJob(
  job: InsightJob,
  logger: ReturnType<typeof createRequestLogger>
): Promise<{ success: boolean; error?: string }> {
  logger.info('Processing insight job', { jobId: job.id, platform: job.platform });

  try {
    // Get the scheduled post
    const post: ScheduledPost = await base44.entities.ScheduledPost.get(job.scheduled_post_id);
    if (!post || post.status !== 'published') {
      return { success: false, error: 'Post not published or not found' };
    }

    // Get social account for access token
    const accounts: SocialAccount[] = await base44.entities.SocialAccount.filter({
      platform: job.platform
    });
    const account = accounts[0];

    if (!account?.access_token) {
      return { success: false, error: 'No social account found for platform' };
    }

    // Check and refresh token if needed
    let accessToken = account.access_token;
    if (tokenNeedsRefresh(account.token_expires_at)) {
      logger.info('Refreshing access token');
      if (job.platform === 'tiktok' && account.refresh_token) {
        const newTokens = await refreshTikTokToken(account.refresh_token, logger);
        if (newTokens) {
          accessToken = newTokens.access_token;
          // Update the stored token
          await base44.entities.SocialAccount.update(account.id, {
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
          });
        }
      }
    }

    // Fetch insights
    const insights = await fetchInsightsFromPlatform(
      job.platform,
      job.platform_post_id,
      accessToken,
      logger
    );

    if (!insights) {
      return { success: false, error: 'Failed to fetch insights from platform' };
    }

    // Determine current interval
    const publishedAt = new Date(post.published_at || job.scheduled_at);
    const hoursSincePublish = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
    const currentInterval = COLLECTION_INTERVALS.find(i => hoursSincePublish >= i - 0.5 && hoursSincePublish <= i + 0.5) || 
                           Math.round(hoursSincePublish);

    // Save insights to PostInsight entity
    const insightRecord: PostInsight = {
      ...insights,
      post_id: job.scheduled_post_id,
      interval_hours: currentInterval
    };

    await base44.entities.PostInsight.create(insightRecord);

    // Update job status
    const completedIntervals = [...(job.fetch_intervals || [])];
    const nextInterval = COLLECTION_INTERVALS.find(i => !completedIntervals.includes(i) && i > currentInterval);
    
    await base44.entities.InsightJob.update(job.id, {
      status: nextInterval ? 'pending' : 'completed',
      current_interval: currentInterval,
      fetch_intervals: [...completedIntervals, currentInterval],
      last_fetched_at: new Date().toISOString(),
      scheduled_at: nextInterval 
        ? new Date(publishedAt.getTime() + nextInterval * 60 * 60 * 1000).toISOString()
        : job.scheduled_at
    });

    logger.info('Insights saved successfully', {
      postId: job.scheduled_post_id,
      interval: currentInterval,
      views: insights.views,
      likes: insights.likes
    });

    return { success: true };
  } catch (error) {
    logger.error('Job processing error', error);
    return { success: false, error: getUserFriendlyError(error, 'insight collection') };
  }
}

// Main handler
app.post('/', async (c) => {
  const logger = createRequestLogger(c.req.raw, 'collectInsights');
  logger.info('Starting insights collection run');

  const startTime = Date.now();
  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [] as string[]
  };

  try {
    // Find pending insight jobs that are due
    const now = new Date().toISOString();
    let pendingJobs: InsightJob[] = [];

    try {
      pendingJobs = await base44.entities.InsightJob.filter({
        status: 'pending'
      }, 'scheduled_at', 50);

      // Filter jobs that are due (scheduled_at <= now)
      pendingJobs = pendingJobs.filter(job => job.scheduled_at <= now);
    } catch {
      logger.info('InsightJob entity not found, checking for published posts to seed jobs');
      
      // Seed insight jobs for recently published posts that don't have jobs yet
      try {
        const publishedPosts: ScheduledPost[] = await base44.entities.ScheduledPost.filter({
          status: 'published'
        }, '-published_at', 20);

        for (const post of publishedPosts) {
          if (!post.platform_post_id) continue;

          // Check if job already exists
          try {
            const existingJobs = await base44.entities.InsightJob.filter({
              scheduled_post_id: post.id
            });
            if (existingJobs.length > 0) continue;
          } catch {
            // Entity might not exist, continue to create
          }

          // Create insight job
          const publishedAt = new Date(post.published_at || new Date());
          try {
            await base44.entities.InsightJob.create({
              scheduled_post_id: post.id,
              platform: post.platform,
              platform_post_id: post.platform_post_id,
              status: 'pending',
              scheduled_at: new Date(publishedAt.getTime() + 60 * 60 * 1000).toISOString(), // T+1h
              current_interval: 0,
              fetch_intervals: []
            });
            logger.info('Created insight job', { postId: post.id });
          } catch (createError) {
            logger.warn('Could not create insight job', { error: createError });
          }
        }
      } catch (postError) {
        logger.warn('Could not seed insight jobs', { error: postError });
      }
    }

    logger.info(`Found ${pendingJobs.length} pending insight jobs`);

    // Process each job
    for (const job of pendingJobs) {
      results.processed++;
      const result = await processInsightJob(job, logger);
      
      if (result.success) {
        results.succeeded++;
      } else {
        results.failed++;
        results.errors.push(`Job ${job.id}: ${result.error}`);
        
        // Update job with error
        try {
          await base44.entities.InsightJob.update(job.id, {
            status: 'failed',
            error_message: result.error
          });
        } catch {
          // Ignore update errors
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Insights collection completed', {
      ...results,
      duration_ms: duration
    });

    return c.json({
      success: true,
      ...results,
      duration_ms: duration
    });
  } catch (error) {
    logger.error('Collection run failed', error);
    return c.json({
      success: false,
      error: getUserFriendlyError(error, 'insights collection'),
      ...results
    }, 500);
  }
});

// Endpoint to manually trigger insights collection for a specific post
app.post('/manual', async (c) => {
  const logger = createRequestLogger(c.req.raw, 'collectInsights:manual');
  
  try {
    const { post_id } = await c.req.json();
    
    if (!post_id) {
      return c.json({ success: false, error: 'post_id is required' }, 400);
    }

    // Get the post
    const post: ScheduledPost = await base44.entities.ScheduledPost.get(post_id);
    if (!post) {
      return c.json({ success: false, error: 'Post not found' }, 404);
    }

    if (!post.platform_post_id) {
      return c.json({ success: false, error: 'Post has no platform_post_id' }, 400);
    }

    // Get social account
    const accounts: SocialAccount[] = await base44.entities.SocialAccount.filter({
      platform: post.platform
    });
    const account = accounts[0];

    if (!account?.access_token) {
      return c.json({ success: false, error: 'No social account found' }, 400);
    }

    // Fetch insights directly
    const insights = await fetchInsightsFromPlatform(
      post.platform,
      post.platform_post_id,
      account.access_token,
      logger
    );

    if (!insights) {
      return c.json({ success: false, error: 'Failed to fetch insights' }, 500);
    }

    // Save to PostInsight
    const saved = await base44.entities.PostInsight.create({
      ...insights,
      post_id: post.id,
      interval_hours: 0 // Manual collection
    });

    return c.json({
      success: true,
      insights: saved
    });
  } catch (error) {
    logger.error('Manual collection failed', error);
    return c.json({
      success: false,
      error: getUserFriendlyError(error, 'manual insights collection')
    }, 500);
  }
});

export default app;
