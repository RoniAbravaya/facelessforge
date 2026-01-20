import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { postId } = await req.json();
    
    if (!postId) {
      return Response.json({ error: 'postId is required' }, { status: 400 });
    }

    // Get the post
    const posts = await base44.asServiceRole.entities.ScheduledPost.filter({ id: postId });
    const post = posts[0];

    if (!post) {
      return Response.json({ error: 'Post not found' }, { status: 404 });
    }

    // Update status to publishing
    await base44.asServiceRole.entities.ScheduledPost.update(postId, {
      status: 'publishing',
      retry_count: (post.retry_count || 0) + 1
    });

    await base44.asServiceRole.entities.PublishAuditLog.create({
      post_id: postId,
      action: 'publish_started',
      metadata: { attempt: post.retry_count + 1 },
      timestamp: new Date().toISOString()
    });

    // Get TikTok access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('tiktok');

    // Download video
    console.log(`[Publish] Downloading video from ${post.video_url}`);
    const videoResponse = await fetch(post.video_url);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    const videoBlob = await videoResponse.blob();
    const videoFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });
    console.log(`[Publish] Downloaded ${videoBlob.size} bytes`);

    // Step 1: Initialize upload (get upload URL)
    console.log('[Publish] Initializing TikTok upload...');
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoBlob.size,
          chunk_size: videoBlob.size,
          total_chunk_count: 1
        }
      })
    });

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      throw new Error(`TikTok init failed: ${initResponse.status} - ${errorText}`);
    }

    const initData = await initResponse.json();
    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;

    if (!publishId || !uploadUrl) {
      throw new Error('Missing publish_id or upload_url from TikTok init response');
    }

    console.log(`[Publish] Got publish_id: ${publishId}`);

    // Step 2: Upload video
    console.log('[Publish] Uploading video to TikTok...');
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBlob.size.toString()
      },
      body: videoBlob
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`TikTok upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    console.log('[Publish] Video uploaded successfully');

    // Step 3: Publish the video
    console.log('[Publish] Publishing to TikTok...');
    const publishResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        post_info: {
          title: post.caption,
          privacy_level: post.privacy_level || 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'FILE_UPLOAD',
          publish_id: publishId
        },
        post_mode: post.publish_mode || 'DIRECT_POST',
        media_type: 'VIDEO'
      })
    });

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      throw new Error(`TikTok publish failed: ${publishResponse.status} - ${errorText}`);
    }

    const publishData = await publishResponse.json();
    console.log('[Publish] TikTok response:', JSON.stringify(publishData));

    // Update post with success
    await base44.asServiceRole.entities.ScheduledPost.update(postId, {
      status: 'published',
      published_at: new Date().toISOString(),
      tiktok_post_id: publishData.data?.publish_id || publishId
    });

    await base44.asServiceRole.entities.PublishAuditLog.create({
      post_id: postId,
      action: 'publish_succeeded',
      metadata: { publish_id: publishId },
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      publish_id: publishId,
      message: 'Published to TikTok successfully'
    });

  } catch (error) {
    console.error('[Publish] Error:', error);

    // Update post with failure
    if (req.json && (await req.json()).postId) {
      const { postId } = await req.json();
      
      await base44.asServiceRole.entities.ScheduledPost.update(postId, {
        status: 'failed',
        error_message: error.message
      });

      await base44.asServiceRole.entities.PublishAuditLog.create({
        post_id: postId,
        action: 'publish_failed',
        metadata: { error: error.message },
        timestamp: new Date().toISOString()
      });
    }

    return Response.json({
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
});