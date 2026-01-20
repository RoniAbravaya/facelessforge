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
│   │   ├── CreateProject.jsx   # Project creation wizard
│   │   ├── Dashboard.jsx       # Main dashboard
│   │   ├── Integrations.jsx    # Provider configuration
│   │   ├── ProjectDetails.jsx  # Project view and progress
│   │   └── TikTokAnalytics.jsx # TikTok performance analytics
│   ├── App.jsx                 # Root application component
│   ├── Layout.jsx              # Page layout with navigation
│   └── main.jsx                # React entry point
├── functions/                  # Backend serverless functions
│   ├── utils/                  # Shared utilities
│   │   ├── logger.ts           # Centralized logging utility
│   │   └── usage.ts            # Usage tracking for billing
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
