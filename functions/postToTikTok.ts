import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { videoUrl, caption, privacyLevel, isDraft, projectId } = await req.json();

    if (!videoUrl) {
      throw new Error('Video URL is required');
    }

    // Get TikTok access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('tiktok');

    // Download video file
    console.log('[TikTok] Downloading video from:', videoUrl);
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    console.log(`[TikTok] Downloaded ${(videoBytes.length / 1024 / 1024).toFixed(2)} MB`);

    if (isDraft) {
      // Upload as draft using Direct Post API (with auto_add_music: false)
      console.log('[TikTok] Uploading as draft...');
      
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
      console.log('[TikTok] Uploading video chunks...');
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

      console.log('[TikTok] Video uploaded, saving as draft...');

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
      console.log('[TikTok] Posting directly to profile...');

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

      console.log('[TikTok] Video published successfully, ID:', publishId);

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
    console.error('[TikTok] Post error:', error);
    
    // Update project with error
    try {
      const { projectId } = await req.json();
      if (projectId) {
        await base44.asServiceRole.entities.Project.update(projectId, {
          'tiktok_settings.post_status': 'failed',
          'tiktok_settings.error': error.message
        });
      }
    } catch {}

    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});