# FacelessForge - AI Content Generator Overview

## Project Summary

FacelessForge is a SaaS platform for automated AI-powered video content generation. It enables users to create faceless videos for social media platforms (primarily TikTok) by orchestrating multiple AI services for script generation, voice synthesis, video clip creation, and final assembly.

## Tech Stack

### Frontend
- **React 18** with Vite build system
- **TanStack Query** for data fetching and caching
- **React Router** for navigation
- **Tailwind CSS** for styling
- **shadcn/ui** components (Radix UI primitives)
- **Framer Motion** for animations
- **@ffmpeg/ffmpeg** for client-side video assembly

### Backend
- **Base44 Platform** - BaaS (Backend as a Service)
- **Deno Runtime** for serverless functions
- **Base44 SDK** for entity management and auth

### External Integrations
- **OpenAI** (GPT-4o-mini) - Script generation and scene planning
- **ElevenLabs** - Text-to-speech voice synthesis
- **Luma AI** (Dream Machine) - AI video clip generation
- **Google Veo** - Alternative video generation
- **Runway ML** - Alternative video generation
- **TikTok API** - Direct video posting

## Project Structure

```
/workspace
├── src/                        # Frontend React application
│   ├── api/                    # API client configuration
│   │   └── base44Client.js     # Base44 SDK client setup
│   ├── components/             # React components
│   │   ├── assembly/           # Video assembly components
│   │   │   └── ClientAssembly.jsx  # Browser-based FFmpeg assembly
│   │   ├── calendar/           # Content calendar components
│   │   │   ├── CalendarMonthView.jsx
│   │   │   ├── CalendarWeekView.jsx
│   │   │   └── PostListView.jsx
│   │   ├── post/               # Post management components
│   │   │   ├── PostCard.jsx
│   │   │   └── TikTokPreview.jsx
│   │   ├── scheduling/         # Scheduling components
│   │   │   └── PostEditor.jsx  # Post creation/editing
│   │   ├── project/            # Project-related components
│   │   │   ├── ArtifactList.jsx    # Display generated artifacts
│   │   │   ├── JobTimeline.jsx     # Job progress timeline
│   │   │   └── SuggestionField.jsx # AI suggestion display
│   │   └── ui/                 # shadcn/ui components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities and context
│   │   ├── AuthContext.jsx     # Authentication context
│   │   ├── templates.js        # Video template definitions
│   │   └── utils.js            # General utilities
│   ├── pages/                  # Page components
│   │   ├── ContentCalendar.jsx # Content scheduling calendar
│   │   ├── CreatePost.jsx      # Create/schedule posts
│   │   ├── CreateProject.jsx   # Project creation wizard
│   │   ├── Dashboard.jsx       # Main dashboard
│   │   ├── Integrations.jsx    # Provider configuration
│   │   ├── ProjectDetails.jsx  # Project view and progress
│   │   └── TikTokAnalytics.jsx # TikTok performance analytics
│   ├── App.jsx                 # Root application component
│   ├── Layout.jsx              # Page layout with navigation
│   └── main.jsx                # React entry point
├── functions/                  # Backend serverless functions
│   ├── publishers/             # Social media publishers
│   │   ├── types.ts            # Publisher interface types
│   │   └── tiktokPublisher.ts  # TikTok publisher implementation
│   ├── utils/                  # Shared utilities
│   │   ├── logger.ts           # Centralized logging utility
│   │   └── usage.ts            # Usage tracking for billing
│   ├── processScheduledPosts.ts # Queue worker for publishing
│   ├── startVideoGeneration.ts # Main generation orchestrator
│   ├── generateScript.ts       # OpenAI script generation
│   ├── generateScenePlan.ts    # Scene breakdown planning
│   ├── generateVoiceover.ts    # ElevenLabs TTS
│   ├── generateLumaClip.ts     # Luma video generation
│   ├── generateRunwayClip.ts   # Runway video generation
│   ├── generateVeoClip.ts      # Google Veo generation
│   ├── lumaCallback.ts         # Luma webhook handler
│   ├── validateLumaGenerations.ts # Luma status validator
│   ├── assembleVideo.ts        # Video assembly coordinator
│   ├── postToTikTok.ts         # TikTok publishing
│   ├── fetchTikTokAnalytics.ts # TikTok analytics fetch
│   └── testIntegration.ts      # Integration testing
└── package.json                # Dependencies
```

## Core Entities (Base44)

### Project
- `id`, `title`, `topic`, `style`
- `duration`, `language`, `aspect_ratio`
- `status`: draft | generating | completed | failed
- `selected_providers`: { llm, voice, video, assembly }
- `tiktok_settings`: posting configuration
- `progress`, `current_step`, `error_message`

### Job
- `id`, `project_id`
- `status`: pending | running | completed | failed
- `current_step`, `progress`
- `started_at`, `finished_at`
- `error_message`

### Artifact
- `id`, `job_id`, `project_id`
- `artifact_type`: script | scene_plan | voiceover | video_clip | video_clip_pending | final_video
- `file_url`, `scene_index`, `duration`
- `metadata`: provider-specific data

### JobEvent
- `id`, `job_id`
- `level`: info | success | warning | error
- `step`, `event_type`, `message`
- `progress`, `data`, `timestamp`

### Integration
- `id`, `provider_type`, `provider_name`
- `api_key`, `status`: active | inactive
- `last_tested_at`, `test_result`

## Video Generation Pipeline

1. **Script Generation** (`generateScript.ts`)
   - Uses OpenAI GPT-4o-mini
   - Generates narration script based on topic

2. **Scene Planning** (`generateScenePlan.ts`)
   - Breaks script into 3-5 visual scenes
   - Creates prompts for video generation
   - Adjusts durations to fit 4-8 second range

3. **Voiceover Generation** (`generateVoiceover.ts`)
   - Uses ElevenLabs multilingual TTS
   - Uploads audio to Base44 storage

4. **Video Clip Generation** (`generateLumaClip.ts`, etc.)
   - Supports Luma, Runway, or Veo
   - Luma uses webhook callbacks for async processing
   - Creates pending artifacts tracked in database

5. **Video Assembly** (`assembleVideo.ts` + `ClientAssembly.jsx`)
   - Client-side FFmpeg WASM assembly
   - Normalizes clips, concatenates, mixes audio
   - Uploads final video to storage

6. **TikTok Publishing** (`postToTikTok.ts`)
   - Direct post or draft mode
   - Supports scheduled posting

## Key Patterns

### Logging
Use the centralized logger from `functions/utils/logger.ts`:
```typescript
import { createRequestLogger, getUserFriendlyError } from './utils/logger.ts';

const logger = createRequestLogger(req, 'functionName');
logger.info('Message', { data });
logger.error('Error', error);
```

### Error Handling
Always use user-friendly error messages:
```typescript
import { ErrorMessages, getUserFriendlyError } from './utils/logger.ts';

// Use predefined messages
throw new Error(ErrorMessages.INVALID_API_KEY);

// Or convert errors
const userMessage = getUserFriendlyError(error, 'Context');
```

### Usage Tracking
Track usage for billing (in `functions/utils/usage.ts`):
```typescript
import { UsageTracker } from './utils/usage.ts';

const tracker = new UsageTracker(userId);
tracker.track('video_generated', { projectId, duration: 60 });
```

## Templates System

Pre-built video templates in `src/lib/templates.js`:
- Educational, Motivational, News, Product, Storytelling
- Listicle, Tutorial, Fitness, Tech, Cooking

Each template includes:
- Default duration, aspect ratio, style
- Topic and style suggestions
- Category classification

## Configuration

### Environment Variables
- `VITE_BASE44_APP_ID` - Base44 application ID
- `VITE_BASE44_APP_BASE_URL` - Backend URL
- `BASE44_APP_ID` - For serverless functions
- `BASE44_API_KEY` - Service role key for webhooks

## Development Guidelines

### Adding New Video Providers
1. Create `generateXxxClip.ts` function
2. Add provider config in `src/pages/Integrations.jsx`
3. Add test case in `testIntegration.ts`
4. Update `startVideoGeneration.ts` switch statement

### Adding New Features
1. Check existing patterns in similar features
2. Use centralized logger for consistent logging
3. Add user-friendly error messages
4. Track usage for billing purposes
5. Update this document if architecture changes

## Known Limitations

- Video assembly requires desktop browser with 4GB+ RAM
- Luma has 3 concurrent job limit on starter plan
- TikTok Direct Post requires verified business account
- Max video duration limited by provider capabilities

## Security Considerations

- API keys stored encrypted in Base44
- All functions verify user authentication
- CORS configured for frontend domain only
- Webhook endpoints validate payload signatures

---

## Module 1: Content Calendar & Scheduler

### Overview
Content scheduling system with calendar views, post management, and reliable publishing queue.

### New Entities (Required in Base44)

#### ScheduledPost
```
- id, user_id
- platform: 'tiktok' | 'instagram' | 'youtube' | 'twitter'
- status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
- caption, hashtags
- video_url, thumbnail_url
- scheduled_at, published_at
- privacy_level
- platform_post_id, platform_url
- project_id (optional - links to generated video)
- error_message, error_code
- retry_count, max_retries
- metadata (JSON)
```

#### PublishAuditLog
```
- id, post_id
- action: 'created' | 'scheduled' | 'published' | 'failed' | 'retried'
- actor_email, actor_type: 'user' | 'system' | 'webhook'
- timestamp
- metadata (JSON)
```

#### InsightJob (for Module 3 preparation)
```
- id, scheduled_post_id
- platform, platform_post_id
- status: 'pending' | 'completed' | 'failed'
- scheduled_at
- fetch_intervals: ['1h', '24h', '72h']
```

### Publisher Provider Interface

Located in `functions/publishers/`:

```typescript
// types.ts - Interface definition
interface Publisher {
  platform: Platform;
  config: PlatformConfig;
  validate(request: PublishRequest): { valid: boolean; errors: string[] };
  publish(request: PublishRequest): Promise<PublishResult>;
  validateToken(accessToken: string): Promise<boolean>;
  refreshToken?(refreshToken: string): Promise<TokenResponse>;
}

// tiktokPublisher.ts - TikTok implementation
// Future: instagramPublisher.ts, youtubePublisher.ts, twitterPublisher.ts
```

### Queue Worker

`processScheduledPosts.ts` should be triggered by cron every minute:
1. Fetches posts where `status = 'scheduled'` AND `scheduled_at <= NOW()`
2. Fetches failed posts ready for retry
3. Processes each post through the publisher
4. Updates status and creates audit logs
5. Seeds insights job for successful publishes

### UI Components

- **ContentCalendar.jsx** - Month/Week/List views with stats
- **CreatePost.jsx** - Post editor with video selection
- **CalendarMonthView.jsx** - Month grid with post cards
- **CalendarWeekView.jsx** - Week timeline view
- **PostListView.jsx** - List view for posts
- **TikTokPreview.jsx** - Platform-specific preview

### Cron Jobs Required

1. **processScheduledPosts** - Every minute
   - Processes due posts
   - Retries failed posts

2. **collectInsights** (Module 3) - Every hour
   - Fetches metrics for published posts

### Environment Variables

```
TIKTOK_CLIENT_KEY=xxx
TIKTOK_CLIENT_SECRET=xxx
BASE44_APP_ID=xxx
BASE44_API_KEY=xxx (service role key)
```

### Success Metrics
- ≥99% publishing success rate
- Queue processing SLA < 60 seconds
- All publish events logged in audit trail

---

## Module 2: Admin Panel & User Management

### Overview
Administrative dashboard with RBAC, user management, queue monitoring, audit logs, and tenant settings.

### New Entities (Required in Base44)

#### User (Extended)
```
- id, email, name
- role: 'superadmin' | 'admin' | 'editor' | 'author'
- status: 'active' | 'suspended' | 'pending'
- invited_at, created_date
- permissions (JSON)
```

#### TenantSettings
```
- id, tenant_id
- publishing_enabled: boolean
- max_posts_per_day: number
- default_privacy: string
- timezone: string
- webhook_url: string
- branding (JSON)
```

### RBAC Roles & Permissions

| Role | Permissions |
|------|-------------|
| superadmin | Full system access across all tenants |
| admin | manage_users, manage_posts, view_analytics, manage_settings |
| editor | manage_posts, view_analytics |
| author | create_posts, view_own_analytics |

### UI Components

- **AdminPanel.jsx** - Main admin dashboard with tabs:
  - Users tab: User listing, invite, edit roles, suspend
  - Queue Monitor tab: View/retry publish jobs
  - Audit Logs tab: Filterable activity log with pagination
  - Settings tab: Tenant configuration form

### Features
1. **User Management**: Invite users via email, assign roles, suspend/activate
2. **Queue Monitoring**: Real-time view of publish jobs, manual retry for failed jobs
3. **Audit Logging**: Track all publish events with actor, timestamp, metadata
4. **Tenant Settings**: Enable/disable publishing, set limits, configure webhooks

### Success Metrics
- Average incident resolution <10 minutes
- 100% logging of critical events
- Role changes audit-trailed

---

## Module 3: Social Media Analytics & Feedback Loop

### Overview
Comprehensive analytics dashboard with performance tracking, AI-powered content analysis, and actionable recommendations.

### New Entities (Required in Base44)

#### PostInsight
```
- id, post_id
- platform, platform_post_id
- snapshot_at: timestamp
- interval_hours: 1 | 24 | 72
- views, likes, comments, shares, saves
- watch_time_avg, completion_rate
- reach, impressions
- raw_data (JSON)
```

#### ContentRecommendation
```
- id, created_date
- title, description
- category: 'timing' | 'content' | 'hashtags' | 'engagement' | 'format' | 'hook'
- priority: 'high' | 'medium' | 'low'
- action: string
- confidence: number
- based_on (JSON array)
```

### Backend Functions

#### fetchPostInsights.ts
- Fetches metrics from platform APIs (TikTok, Instagram, YouTube)
- Normalizes data to unified schema
- Handles token refresh for expired credentials

#### collectInsights.ts (Cron Worker)
- Runs hourly to process InsightJob queue
- Fetches metrics at T+1h, T+24h, T+72h intervals
- Seeds insight jobs for newly published posts
- Updates job status and handles failures

#### analyzeContent.ts
- AI-powered content analysis using OpenAI
- Extracts content features (caption length, hashtags, timing)
- Generates personalized recommendations
- Fallback to rule-based recommendations if no API key

### UI Components

- **AnalyticsDashboard.jsx** - Main analytics page with tabs:
  - Overview: KPI cards, engagement breakdown, platform stats
  - Post Analysis: Top/bottom performers with metrics
  - AI Insights: AI recommendations, quick insights
  - A/B Compare: Side-by-side post comparison

### KPIs Tracked
- Total views, engagement rate, watch time, completion rate
- Likes, comments, shares, saves breakdown
- Platform-specific performance
- Posting time optimization

### AI Recommendation Categories
1. **Timing**: Optimal posting schedule based on performance
2. **Content**: Caption and topic improvements
3. **Hashtags**: Tag optimization strategies
4. **Engagement**: CTAs and interaction boosters
5. **Format**: Video length and style suggestions
6. **Hook**: Opening improvement for retention

### Cron Jobs Required

1. **collectInsights** - Every hour
   - Processes InsightJob queue
   - Fetches platform metrics
   - Seeds jobs for new published posts

2. **analyzeContent** - Daily (optional)
   - Regenerates AI recommendations
   - Updates content analysis

### Environment Variables
```
OPENAI_API_KEY=xxx (for AI recommendations)
TIKTOK_CLIENT_KEY=xxx
TIKTOK_CLIENT_SECRET=xxx
```

### Success Metrics
- Time-to-insight < 24h after publish
- ≥90% of posts receive AI feedback
- Actionable recommendations per analysis run ≥ 5
