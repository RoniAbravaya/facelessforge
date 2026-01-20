/**
 * syncTikTokAnalytics - Syncs analytics data from TikTok API to PostInsight entities.
 * Called periodically or on-demand to fetch latest metrics for published posts.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get TikTok access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('tiktok');

    // Fetch videos from TikTok
    const videosResponse = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,create_time,share_url,view_count,like_count,comment_count,share_count&max_count=50', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!videosResponse.ok) {
      const errorText = await videosResponse.text();
      throw new Error(`TikTok API error: ${videosResponse.status} - ${errorText}`);
    }

    const videosData = await videosResponse.json();
    const videos = videosData.data?.videos || [];

    // Get all published posts with TikTok IDs
    const publishedPosts = await base44.asServiceRole.entities.ScheduledPost.filter({ 
      status: 'published',
      platform: 'tiktok'
    });

    let synced = 0;
    let created = 0;
    let updated = 0;

    for (const post of publishedPosts) {
      const tiktokId = post.tiktok_post_id;
      if (!tiktokId) continue;

      // Find matching TikTok video
      const tiktokVideo = videos.find(v => v.id === tiktokId);
      if (!tiktokVideo) continue;

      // Calculate metrics
      const views = tiktokVideo.view_count || 0;
      const likes = tiktokVideo.like_count || 0;
      const comments = tiktokVideo.comment_count || 0;
      const shares = tiktokVideo.share_count || 0;
      const engagement_rate = views > 0 ? ((likes + comments + shares) / views) * 100 : 0;

      const insightData = {
        post_id: post.id,
        platform: 'tiktok',
        platform_video_id: tiktokId,
        views,
        likes,
        comments,
        shares,
        saves: 0, // TikTok API doesn't provide saves in this endpoint
        engagement_rate,
        caption: post.caption,
        video_url: post.video_url,
        last_synced_at: new Date().toISOString()
      };

      // Check if insight already exists
      const existingInsights = await base44.asServiceRole.entities.PostInsight.filter({ post_id: post.id });
      
      if (existingInsights.length > 0) {
        await base44.asServiceRole.entities.PostInsight.update(existingInsights[0].id, insightData);
        updated++;
      } else {
        await base44.asServiceRole.entities.PostInsight.create(insightData);
        created++;
      }

      synced++;
    }

    return Response.json({
      success: true,
      synced,
      created,
      updated,
      total_videos: videos.length,
      total_posts: publishedPosts.length
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});