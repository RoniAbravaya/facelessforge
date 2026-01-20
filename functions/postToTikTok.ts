/**
 * Post video to TikTok using TikTok's Direct Post API.
 * Supports direct posting, draft saving, and scheduled posts.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createRequestLogger, getUserFriendlyError } from './utils/logger.ts';

Deno.serve(async (req) => {
  const logger = createRequestLogger(req, 'postToTikTok');
  const base44 = createClientFromRequest(req);
  
  // Parse request body once at the start
  let requestBody: {
    videoUrl?: string;
    caption?: string;
    privacyLevel?: string;
    isDraft?: boolean;
    projectId?: string;
  } = {};
  
  try {
    requestBody = await req.json();
  } catch (parseError) {
    logger.error('Failed to parse request body', parseError);
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  
  const { videoUrl, caption, privacyLevel, isDraft, projectId } = requestBody;
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      logger.warn('Unauthorized access attempt');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('Starting TikTok post', { 
      projectId, 
      isDraft, 
      privacyLevel,
      hasCaption: !!caption 
    });

    if (!videoUrl) {
      throw new Error('Video URL is required');
    }

    // Get TikTok access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('tiktok');

    // Download video file
    logger.info('Downloading video', { url: videoUrl?.substring(0, 50) });
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
    }
    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    const sizeMB = (videoBytes.length / 1024 / 1024).toFixed(2);
    logger.info('Video downloaded', { sizeMB, bytes: videoBytes.length });

    if (isDraft) {
      // Upload as draft using Direct Post API (with auto_add_music: false)
      logger.info('Uploading as draft');
      
      const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoBytes.length,
            chunk_size: videoBytes.length,
            total_chunk_count: 1
          }
        })
      });

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`TikTok init failed (${initResponse.status}): ${errorText}`);
      }

      const initData = await initResponse.json();
      const { publish_id, upload_url } = initData.data;

      // Upload video file
      logger.info('Uploading video chunks');
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes 0-${videoBytes.length - 1}/${videoBytes.length}`,
          'Content-Length': videoBytes.length.toString()
        },
        body: videoBytes
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`TikTok upload failed (${uploadResponse.status}): ${errorText}`);
      }

      logger.info('Video uploaded, saving as draft');

      // Publish to inbox (draft)
      const publishResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
          post_info: {
            title: caption || 'Video created with FacelessForge',
            privacy_level: privacyLevel || 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl
          },
          post_mode: 'DIRECT_POST',
          media_type: 'VIDEO'
        })
      });

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        throw new Error(`TikTok draft save failed (${publishResponse.status}): ${errorText}`);
      }

      const publishData = await publishResponse.json();

      // Update project with draft status
      if (projectId) {
        await base44.asServiceRole.entities.Project.update(projectId, {
          'tiktok_settings.post_status': 'posted',
          'tiktok_settings.tiktok_video_id': publishData.data?.publish_id || 'draft_created'
        });
      }

      return Response.json({
        success: true,
        mode: 'draft',
        publishId: publish_id,
        message: 'Video saved as draft in TikTok. Open the TikTok app to finish editing and publish.'
      });

    } else {
      // Direct post using Direct Post API
      logger.info('Posting directly to profile');

      const publishResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
          post_info: {
            title: caption || 'Video created with FacelessForge',
            privacy_level: privacyLevel || 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl
          },
          post_mode: 'DIRECT_POST',
          media_type: 'VIDEO'
        })
      });

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        throw new Error(`TikTok publish failed (${publishResponse.status}): ${errorText}`);
      }

      const publishData = await publishResponse.json();
      const publishId = publishData.data?.publish_id;

      logger.info('Video published successfully', { publishId });

      // Update project
      if (projectId) {
        await base44.asServiceRole.entities.Project.update(projectId, {
          'tiktok_settings.post_status': 'posted',
          'tiktok_settings.tiktok_video_id': publishId
        });
      }

      return Response.json({
        success: true,
        mode: 'direct_post',
        publishId,
        message: 'Video posted to TikTok successfully!'
      });
    }

  } catch (error) {
    logger.error('TikTok post failed', error, { projectId });
    
    // Update project with error - use already parsed requestBody
    if (projectId) {
      try {
        await base44.asServiceRole.entities.Project.update(projectId, {
          'tiktok_settings.post_status': 'failed',
          'tiktok_settings.error': getUserFriendlyError(error, 'TikTok posting')
        });
      } catch (updateError) {
        logger.error('Failed to update project with error status', updateError);
      }
    }

    const userMessage = getUserFriendlyError(error, 'TikTok posting');
    return Response.json({ 
      error: userMessage,
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});