/**
 * fetchPostInsights - Fetches performance metrics for a published post from the platform API.
 * Called by collectInsights cron worker to gather analytics data.
 */
import { Hono } from 'https://deno.land/x/hono@v3.11.7/mod.ts';
import { createRequestLogger, getUserFriendlyError, ErrorMessages } from './utils/logger.ts';

const app = new Hono();

// Platform API endpoints and configurations
const PLATFORM_CONFIG = {
  tiktok: {
    baseUrl: 'https://open.tiktokapis.com/v2',
    metricsEndpoint: '/video/query/',
    requiredScopes: ['video.list', 'video.insights']
  },
  instagram: {
    baseUrl: 'https://graph.instagram.com',
    metricsEndpoint: '/insights',
    requiredScopes: ['instagram_basic', 'instagram_manage_insights']
  },
  youtube: {
    baseUrl: 'https://www.googleapis.com/youtube/v3',
    metricsEndpoint: '/videos',
    requiredScopes: ['youtube.readonly']
  }
};

// Metric mappings per platform
const METRIC_MAPPINGS = {
  tiktok: {
    view_count: 'views',
    like_count: 'likes',
    comment_count: 'comments',
    share_count: 'shares',
    favorite_count: 'saves',
    average_time_watched: 'watch_time_avg',
    video_duration: 'duration'
  },
  instagram: {
    impressions: 'views',
    likes: 'likes',
    comments: 'comments',
    shares: 'shares',
    saved: 'saves',
    video_views: 'video_views'
  },
  youtube: {
    viewCount: 'views',
    likeCount: 'likes',
    commentCount: 'comments',
    favoriteCount: 'favorites',
    averageViewDuration: 'watch_time_avg'
  }
};

interface InsightRequest {
  platform: 'tiktok' | 'instagram' | 'youtube';
  platform_post_id: string;
  access_token: string;
  scheduled_post_id?: string;
}

interface InsightResponse {
  success: boolean;
  insights?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    watch_time_avg: number;
    completion_rate: number;
    reach?: number;
    impressions?: number;
  };
  error?: string;
  raw_response?: Record<string, unknown>;
}

// Fetch TikTok video insights
async function fetchTikTokInsights(
  postId: string,
  accessToken: string,
  logger: ReturnType<typeof createRequestLogger>
): Promise<InsightResponse> {
  logger.info('Fetching TikTok insights', { postId });

  const fields = [
    'id', 'title', 'view_count', 'like_count', 'comment_count',
    'share_count', 'favorite_count', 'average_time_watched', 'video_duration'
  ].join(',');

  try {
    const response = await fetch(
      `${PLATFORM_CONFIG.tiktok.baseUrl}/video/query/?fields=${fields}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filters: {
            video_ids: [postId]
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('TikTok API error', { status: response.status, error: errorData });
      return {
        success: false,
        error: `TikTok API error: ${response.status}`,
        raw_response: errorData
      };
    }

    const data = await response.json();
    const video = data.data?.videos?.[0];

    if (!video) {
      return { success: false, error: 'Video not found' };
    }

    const duration = video.video_duration || 1;
    const avgWatchTime = video.average_time_watched || 0;
    const completionRate = duration > 0 ? Math.min(avgWatchTime / duration, 1) : 0;

    return {
      success: true,
      insights: {
        views: video.view_count || 0,
        likes: video.like_count || 0,
        comments: video.comment_count || 0,
        shares: video.share_count || 0,
        saves: video.favorite_count || 0,
        watch_time_avg: avgWatchTime,
        completion_rate: completionRate
      },
      raw_response: video
    };
  } catch (error) {
    logger.error('Failed to fetch TikTok insights', error);
    return {
      success: false,
      error: getUserFriendlyError(error, 'TikTok insights fetch')
    };
  }
}

// Fetch Instagram insights
async function fetchInstagramInsights(
  postId: string,
  accessToken: string,
  logger: ReturnType<typeof createRequestLogger>
): Promise<InsightResponse> {
  logger.info('Fetching Instagram insights', { postId });

  try {
    // First get media details
    const mediaResponse = await fetch(
      `${PLATFORM_CONFIG.instagram.baseUrl}/${postId}?fields=id,media_type,like_count,comments_count&access_token=${accessToken}`
    );

    if (!mediaResponse.ok) {
      const errorData = await mediaResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `Instagram API error: ${mediaResponse.status}`,
        raw_response: errorData
      };
    }

    const mediaData = await mediaResponse.json();

    // Then get insights
    const insightsResponse = await fetch(
      `${PLATFORM_CONFIG.instagram.baseUrl}/${postId}/insights?metric=impressions,reach,saved,shares,video_views&access_token=${accessToken}`
    );

    let insightsData: Record<string, number> = {};
    if (insightsResponse.ok) {
      const raw = await insightsResponse.json();
      raw.data?.forEach((metric: { name: string; values: { value: number }[] }) => {
        insightsData[metric.name] = metric.values?.[0]?.value || 0;
      });
    }

    return {
      success: true,
      insights: {
        views: insightsData.impressions || 0,
        likes: mediaData.like_count || 0,
        comments: mediaData.comments_count || 0,
        shares: insightsData.shares || 0,
        saves: insightsData.saved || 0,
        watch_time_avg: 0,
        completion_rate: 0,
        reach: insightsData.reach || 0,
        impressions: insightsData.impressions || 0
      },
      raw_response: { ...mediaData, insights: insightsData }
    };
  } catch (error) {
    logger.error('Failed to fetch Instagram insights', error);
    return {
      success: false,
      error: getUserFriendlyError(error, 'Instagram insights fetch')
    };
  }
}

// Fetch YouTube insights
async function fetchYouTubeInsights(
  postId: string,
  accessToken: string,
  logger: ReturnType<typeof createRequestLogger>
): Promise<InsightResponse> {
  logger.info('Fetching YouTube insights', { postId });

  try {
    const response = await fetch(
      `${PLATFORM_CONFIG.youtube.baseUrl}/videos?part=statistics,contentDetails&id=${postId}&access_token=${accessToken}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `YouTube API error: ${response.status}`,
        raw_response: errorData
      };
    }

    const data = await response.json();
    const video = data.items?.[0];

    if (!video) {
      return { success: false, error: 'Video not found' };
    }

    const stats = video.statistics || {};

    return {
      success: true,
      insights: {
        views: parseInt(stats.viewCount) || 0,
        likes: parseInt(stats.likeCount) || 0,
        comments: parseInt(stats.commentCount) || 0,
        shares: 0, // YouTube API doesn't provide shares
        saves: parseInt(stats.favoriteCount) || 0,
        watch_time_avg: 0,
        completion_rate: 0
      },
      raw_response: video
    };
  } catch (error) {
    logger.error('Failed to fetch YouTube insights', error);
    return {
      success: false,
      error: getUserFriendlyError(error, 'YouTube insights fetch')
    };
  }
}

// Main handler
app.post('/', async (c) => {
  const logger = createRequestLogger(c.req.raw, 'fetchPostInsights');
  
  try {
    const body: InsightRequest = await c.req.json();
    const { platform, platform_post_id, access_token, scheduled_post_id } = body;

    logger.info('Fetching post insights', { platform, platform_post_id, scheduled_post_id });

    // Validate inputs
    if (!platform || !platform_post_id || !access_token) {
      return c.json({
        success: false,
        error: 'Missing required fields: platform, platform_post_id, access_token'
      }, 400);
    }

    // Fetch insights based on platform
    let result: InsightResponse;
    switch (platform) {
      case 'tiktok':
        result = await fetchTikTokInsights(platform_post_id, access_token, logger);
        break;
      case 'instagram':
        result = await fetchInstagramInsights(platform_post_id, access_token, logger);
        break;
      case 'youtube':
        result = await fetchYouTubeInsights(platform_post_id, access_token, logger);
        break;
      default:
        return c.json({
          success: false,
          error: `Unsupported platform: ${platform}`
        }, 400);
    }

    if (result.success) {
      logger.info('Successfully fetched insights', { 
        platform, 
        views: result.insights?.views,
        likes: result.insights?.likes 
      });
    } else {
      logger.warn('Failed to fetch insights', { error: result.error });
    }

    return c.json(result);
  } catch (error) {
    logger.error('Unexpected error', error);
    return c.json({
      success: false,
      error: getUserFriendlyError(error, 'insights fetch')
    }, 500);
  }
});

export default app;
