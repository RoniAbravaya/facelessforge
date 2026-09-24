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

    // Fetch user info and stats
    const userInfoResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url,follower_count,following_count,likes_count,video_count', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      throw new Error(`TikTok API error: ${userInfoResponse.status} - ${errorText}`);
    }

    const userInfo = await userInfoResponse.json();

    // Fetch recent videos
    const videosResponse = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,create_time,share_url,view_count,like_count,comment_count,share_count&max_count=20', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!videosResponse.ok) {
      const errorText = await videosResponse.text();
      throw new Error(`TikTok videos API error: ${videosResponse.status} - ${errorText}`);
    }

    const videosData = await videosResponse.json();

    return Response.json({
      userInfo: userInfo.data?.user || {},
      videos: videosData.data?.videos || [],
      hasMore: videosData.data?.has_more || false
    });

  } catch (error) {
    console.error('TikTok analytics error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});