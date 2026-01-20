/**
 * TikTok Publisher - Implementation of the Publisher interface for TikTok.
 * Handles video publishing via TikTok's Direct Post API.
 */

import { Publisher, PublishRequest, PublishResult, PlatformConfig } from './types.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger({ step: 'tiktokPublisher', provider: 'tiktok' });

export const TIKTOK_CONFIG: PlatformConfig = {
  name: 'TikTok',
  maxCaptionLength: 2200,
  maxHashtags: 30,
  supportedAspectRatios: ['9:16', '1:1'],
  maxVideoDuration: 600, // 10 minutes
  minVideoDuration: 3,
  requiredScopes: ['video.publish', 'video.upload'],
};

export class TikTokPublisher implements Publisher {
  platform = 'tiktok' as const;
  config = TIKTOK_CONFIG;

  validate(request: PublishRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.videoUrl) {
      errors.push('Video URL is required');
    }

    if (request.caption && request.caption.length > this.config.maxCaptionLength) {
      errors.push(`Caption exceeds ${this.config.maxCaptionLength} characters`);
    }

    if (!request.accessToken) {
      errors.push('Access token is required');
    }

    // Extract and count hashtags
    const hashtags = (request.caption || '').match(/#\w+/g) || [];
    if (hashtags.length > this.config.maxHashtags) {
      errors.push(`Too many hashtags (${hashtags.length}/${this.config.maxHashtags})`);
    }

    return { valid: errors.length === 0, errors };
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch('https://open.tiktokapis.com/v2/user/info/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      return response.ok;
    } catch (error) {
      logger.error('Token validation failed', error);
      return false;
    }
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }> {
    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');

    if (!clientKey || !clientSecret) {
      throw new Error('TikTok client credentials not configured');
    }

    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const correlationId = `tiktok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info('Starting TikTok publish', { 
      correlationId, 
      postId: request.postId,
      captionLength: request.caption?.length 
    });

    try {
      // Validate request
      const validation = this.validate(request);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', '),
          errorCode: 'VALIDATION_ERROR',
          retryable: false,
        };
      }

      // Download video
      logger.info('Downloading video', { correlationId, url: request.videoUrl.substring(0, 50) });
      const videoResponse = await fetch(request.videoUrl);
      if (!videoResponse.ok) {
        return {
          success: false,
          error: `Failed to download video: ${videoResponse.status}`,
          errorCode: 'VIDEO_DOWNLOAD_ERROR',
          retryable: true,
        };
      }
      const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
      const sizeMB = (videoBytes.length / 1024 / 1024).toFixed(2);
      logger.info('Video downloaded', { correlationId, sizeMB });

      // Initialize upload
      logger.info('Initializing TikTok upload', { correlationId });
      const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${request.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: request.caption || 'Video',
            privacy_level: request.privacyLevel || 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: request.videoUrl,
          },
          post_mode: 'DIRECT_POST',
          media_type: 'VIDEO',
        }),
      });

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        logger.error('TikTok init failed', null, { correlationId, status: initResponse.status, error: errorText });

        // Check for specific error codes
        let errorCode = 'TIKTOK_API_ERROR';
        let retryable = true;

        if (initResponse.status === 401) {
          errorCode = 'AUTH_ERROR';
          retryable: false;
        } else if (initResponse.status === 429) {
          errorCode = 'RATE_LIMITED';
        } else if (initResponse.status >= 500) {
          errorCode = 'TIKTOK_SERVER_ERROR';
        }

        return {
          success: false,
          error: `TikTok API error (${initResponse.status}): ${errorText}`,
          errorCode,
          retryable,
        };
      }

      const initData = await initResponse.json();
      const publishId = initData.data?.publish_id;

      if (!publishId) {
        return {
          success: false,
          error: 'No publish ID returned from TikTok',
          errorCode: 'MISSING_PUBLISH_ID',
          retryable: true,
        };
      }

      logger.info('TikTok publish initiated', { correlationId, publishId });

      // For Direct Post, we need to poll for status
      // TikTok processes the video asynchronously
      let attempts = 0;
      const maxAttempts = 30;
      const pollInterval = 5000; // 5 seconds

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;

        const statusResponse = await fetch(
          `https://open.tiktokapis.com/v2/post/publish/status/fetch/?publish_id=${publishId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${request.accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!statusResponse.ok) {
          logger.warn('Status check failed', { correlationId, attempt: attempts });
          continue;
        }

        const statusData = await statusResponse.json();
        const status = statusData.data?.status;

        logger.info('Publish status', { correlationId, status, attempt: attempts });

        if (status === 'PUBLISH_COMPLETE') {
          const publicId = statusData.data?.public_post_id;
          return {
            success: true,
            platformPostId: publicId || publishId,
            platformUrl: publicId ? `https://www.tiktok.com/@user/video/${publicId}` : undefined,
            metadata: {
              publishId,
              statusData: statusData.data,
            },
          };
        } else if (status === 'FAILED') {
          return {
            success: false,
            error: statusData.data?.fail_reason || 'Publish failed',
            errorCode: 'PUBLISH_FAILED',
            retryable: true,
            metadata: { statusData: statusData.data },
          };
        }
        // PROCESSING_DOWNLOAD, PROCESSING_UPLOAD, SENDING_TO_USER_INBOX - continue polling
      }

      // Timeout waiting for completion
      return {
        success: false,
        error: 'Timeout waiting for TikTok to process video',
        errorCode: 'TIMEOUT',
        retryable: true,
        metadata: { publishId, attempts },
      };

    } catch (error) {
      logger.error('TikTok publish error', error, { correlationId: correlationId });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'UNEXPECTED_ERROR',
        retryable: true,
      };
    }
  }
}

// Export singleton instance
export const tiktokPublisher = new TikTokPublisher();
