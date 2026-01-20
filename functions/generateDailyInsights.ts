/**
 * generateDailyInsights - Daily automation to analyze published video performance and generate insights.
 * Runs at 02:00 UTC, analyzes videos from previous day, creates PerformanceInsight records.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MIN_SAMPLE_SIZE = 5;

function calculateEngagementScore(video) {
  const views = video.view_count || 0;
  const likes = video.like_count || 0;
  const shares = video.share_count || 0;
  const comments = video.comment_count || 0;

  if (views === 0) return 0;

  const likeRate = likes / views;
  const shareRate = shares / views;
  const commentRate = comments / views;

  return (likeRate * 100 * 0.4) + (shareRate * 100 * 0.4) + (commentRate * 100 * 0.2);
}

function getConfidenceLevel(sampleSize) {
  if (sampleSize >= 20) return 'high';
  if (sampleSize >= 10) return 'medium';
  return 'low';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const publishedPosts = await base44.asServiceRole.entities.ScheduledPost.filter({
      status: 'published',
    });

    const recentPosts = publishedPosts.filter(post => {
      const publishedAt = new Date(post.published_at);
      return publishedAt >= yesterday;
    });

    if (recentPosts.length === 0) {
      console.log('No recently published posts to analyze');
      return Response.json({ insights_generated: 0, message: 'No posts to analyze' });
    }

    const videoAnalytics = [];

    for (const post of recentPosts) {
      if (!post.linked_project_id) continue;

      try {
        const project = await base44.asServiceRole.entities.Project.get(post.linked_project_id);
        const userEmail = project.created_by;

        const analytics = await base44.asServiceRole.functions.invoke('fetchTikTokAnalytics', {});
        
        if (analytics.data && analytics.data.videos) {
          const tiktokVideo = analytics.data.videos.find(v => v.id === post.tiktok_post_id);
          
          if (tiktokVideo) {
            videoAnalytics.push({
              topic: project.topic,
              style: project.style,
              duration: project.duration,
              aspect_ratio: project.aspect_ratio,
              views: tiktokVideo.view_count || 0,
              likes: tiktokVideo.like_count || 0,
              shares: tiktokVideo.share_count || 0,
              comments: tiktokVideo.comment_count || 0,
              engagement_score: calculateEngagementScore(tiktokVideo),
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching analytics for post ${post.id}:`, error);
      }
    }

    if (videoAnalytics.length === 0) {
      console.log('No video analytics data available');
      return Response.json({ insights_generated: 0, message: 'No analytics data' });
    }

    const insightsGenerated = [];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const groupByTopic = videoAnalytics.reduce((acc, video) => {
      const key = video.topic || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(video);
      return acc;
    }, {});

    for (const [topic, videos] of Object.entries(groupByTopic)) {
      if (videos.length >= MIN_SAMPLE_SIZE) {
        const avgViews = videos.reduce((sum, v) => sum + v.views, 0) / videos.length;
        const avgLikes = videos.reduce((sum, v) => sum + v.likes, 0) / videos.length;
        const avgShares = videos.reduce((sum, v) => sum + v.shares, 0) / videos.length;
        const avgEngagement = videos.reduce((sum, v) => sum + v.engagement_score, 0) / videos.length;

        const insight = await base44.asServiceRole.entities.PerformanceInsight.create({
          insight_type: 'topic',
          attribute_value: topic,
          sample_size: videos.length,
          avg_views: avgViews,
          avg_likes: avgLikes,
          avg_shares: avgShares,
          avg_engagement_score: avgEngagement,
          confidence_level: getConfidenceLevel(videos.length),
          generated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });

        insightsGenerated.push(insight.id);
      }
    }

    const groupByStyle = videoAnalytics.reduce((acc, video) => {
      const key = video.style || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(video);
      return acc;
    }, {});

    for (const [style, videos] of Object.entries(groupByStyle)) {
      if (videos.length >= MIN_SAMPLE_SIZE) {
        const avgViews = videos.reduce((sum, v) => sum + v.views, 0) / videos.length;
        const avgLikes = videos.reduce((sum, v) => sum + v.likes, 0) / videos.length;
        const avgShares = videos.reduce((sum, v) => sum + v.shares, 0) / videos.length;
        const avgEngagement = videos.reduce((sum, v) => sum + v.engagement_score, 0) / videos.length;

        const insight = await base44.asServiceRole.entities.PerformanceInsight.create({
          insight_type: 'style',
          attribute_value: style,
          sample_size: videos.length,
          avg_views: avgViews,
          avg_likes: avgLikes,
          avg_shares: avgShares,
          avg_engagement_score: avgEngagement,
          confidence_level: getConfidenceLevel(videos.length),
          generated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });

        insightsGenerated.push(insight.id);
      }
    }

    const groupByDuration = videoAnalytics.reduce((acc, video) => {
      const duration = video.duration || 0;
      let key = '0-30s';
      if (duration > 60) key = '60s+';
      else if (duration > 30) key = '30-60s';
      
      if (!acc[key]) acc[key] = [];
      acc[key].push(video);
      return acc;
    }, {});

    for (const [durationRange, videos] of Object.entries(groupByDuration)) {
      if (videos.length >= MIN_SAMPLE_SIZE) {
        const avgViews = videos.reduce((sum, v) => sum + v.views, 0) / videos.length;
        const avgLikes = videos.reduce((sum, v) => sum + v.likes, 0) / videos.length;
        const avgShares = videos.reduce((sum, v) => sum + v.shares, 0) / videos.length;
        const avgEngagement = videos.reduce((sum, v) => sum + v.engagement_score, 0) / videos.length;

        const insight = await base44.asServiceRole.entities.PerformanceInsight.create({
          insight_type: 'duration',
          attribute_value: durationRange,
          sample_size: videos.length,
          avg_views: avgViews,
          avg_likes: avgLikes,
          avg_shares: avgShares,
          avg_engagement_score: avgEngagement,
          confidence_level: getConfidenceLevel(videos.length),
          generated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });

        insightsGenerated.push(insight.id);
      }
    }

    const groupByAspectRatio = videoAnalytics.reduce((acc, video) => {
      const key = video.aspect_ratio || '9:16';
      if (!acc[key]) acc[key] = [];
      acc[key].push(video);
      return acc;
    }, {});

    for (const [aspectRatio, videos] of Object.entries(groupByAspectRatio)) {
      if (videos.length >= MIN_SAMPLE_SIZE) {
        const avgViews = videos.reduce((sum, v) => sum + v.views, 0) / videos.length;
        const avgLikes = videos.reduce((sum, v) => sum + v.likes, 0) / videos.length;
        const avgShares = videos.reduce((sum, v) => sum + v.shares, 0) / videos.length;
        const avgEngagement = videos.reduce((sum, v) => sum + v.engagement_score, 0) / videos.length;

        const insight = await base44.asServiceRole.entities.PerformanceInsight.create({
          insight_type: 'aspect_ratio',
          attribute_value: aspectRatio,
          sample_size: videos.length,
          avg_views: avgViews,
          avg_likes: avgLikes,
          avg_shares: avgShares,
          avg_engagement_score: avgEngagement,
          confidence_level: getConfidenceLevel(videos.length),
          generated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        });

        insightsGenerated.push(insight.id);
      }
    }

    return Response.json({ 
      insights_generated: insightsGenerated.length,
      total_videos_analyzed: videoAnalytics.length,
      insight_ids: insightsGenerated,
    });
  } catch (error) {
    console.error('Error generating insights:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});