/**
 * Publisher Types - Defines interfaces for social media publishing providers.
 * Implements the Provider/Adapter pattern for platform abstraction.
 */

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'twitter' | 'linkedin' | 'facebook';

export type PublishStatus = 'pending' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PublishRequest {
  postId: string;
  platform: Platform;
  videoUrl: string;
  caption: string;
  hashtags?: string[];
  privacyLevel?: string;
  scheduledAt?: string;
  accessToken: string;
  metadata?: Record<string, unknown>;
}

export interface PlatformConfig {
  name: string;
  maxCaptionLength: number;
  maxHashtags: number;
  supportedAspectRatios: string[];
  maxVideoDuration: number;
  minVideoDuration: number;
  requiredScopes: string[];
}

export interface Publisher {
  platform: Platform;
  config: PlatformConfig;
  
  /**
   * Validate the publish request against platform rules
   */
  validate(request: PublishRequest): { valid: boolean; errors: string[] };
  
  /**
   * Publish content to the platform
   */
  publish(request: PublishRequest): Promise<PublishResult>;
  
  /**
   * Check if access token is valid
   */
  validateToken(accessToken: string): Promise<boolean>;
  
  /**
   * Refresh access token if expired
   */
  refreshToken?(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }>;
}

// Entity types for Base44
export interface ScheduledPostEntity {
  id: string;
  user_id?: string;
  platform: Platform;
  status: PublishStatus;
  caption: string;
  video_url: string;
  thumbnail_url?: string;
  scheduled_at: string;
  published_at?: string;
  privacy_level?: string;
  platform_post_id?: string;
  platform_url?: string;
  project_id?: string;
  error_message?: string;
  error_code?: string;
  retry_count: number;
  max_retries: number;
  metadata?: Record<string, unknown>;
  created_date?: string;
  updated_date?: string;
}

export interface PublishJobEntity {
  id: string;
  scheduled_post_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  step: 'validate' | 'prepare_assets' | 'publish' | 'confirm' | 'seed_insights';
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  attempts: number;
  next_retry_at?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntity {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id?: string;
  actor_type: 'user' | 'system' | 'webhook';
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
}
