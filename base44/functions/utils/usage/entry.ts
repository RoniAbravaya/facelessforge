/**
 * Usage tracking utility for FacelessForge SaaS metrics.
 * Tracks video generation usage, API calls, and resource consumption.
 */

export type UsageEventType = 
  | 'project_created'
  | 'video_generated'
  | 'script_generated'
  | 'voiceover_generated'
  | 'video_clip_generated'
  | 'video_assembled'
  | 'tiktok_posted'
  | 'api_call'
  | 'storage_used';

export interface UsageEvent {
  type: UsageEventType;
  userId?: string;
  projectId?: string;
  jobId?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
  cost?: number; // Estimated cost in cents
  duration?: number; // Duration in seconds for video-related events
  tokens?: number; // Token usage for LLM calls
  characters?: number; // Character count for TTS
  bytes?: number; // Storage bytes used
  timestamp: string;
}

export interface UsageSummary {
  totalVideos: number;
  totalDurationSeconds: number;
  totalLLMTokens: number;
  totalTTSCharacters: number;
  totalStorageBytes: number;
  totalApiCalls: number;
  estimatedCostCents: number;
  byProvider: Record<string, {
    calls: number;
    cost: number;
  }>;
}

// Cost estimates per provider (in cents)
const COST_ESTIMATES = {
  // LLM costs per 1K tokens
  llm_openai: {
    input: 0.015, // $0.00015 per input token for gpt-4o-mini
    output: 0.06, // $0.0006 per output token
  },
  // TTS costs per character
  voice_elevenlabs: 0.0003, // ~$0.30 per 1K characters
  // Video generation costs per second
  video_luma: 5.0, // ~$0.05 per second (rough estimate)
  video_runway: 8.0, // ~$0.08 per second
  video_veo: 3.0, // ~$0.03 per second (Google pricing)
  // Assembly costs per video
  assembly_client: 0, // Free (client-side)
  assembly_shotstack: 10, // ~$0.10 per render
};

/**
 * Calculate estimated cost for a usage event
 */
export function calculateCost(event: Partial<UsageEvent>): number {
  const { type, provider, tokens, characters, duration } = event;
  
  if (!provider) return 0;
  
  let cost = 0;
  
  switch (type) {
    case 'script_generated':
      if (tokens && provider === 'llm_openai') {
        // Assume 20% input, 80% output for script generation
        const inputTokens = Math.round(tokens * 0.2);
        const outputTokens = Math.round(tokens * 0.8);
        cost = (inputTokens / 1000 * COST_ESTIMATES.llm_openai.input) +
               (outputTokens / 1000 * COST_ESTIMATES.llm_openai.output);
      }
      break;
      
    case 'voiceover_generated':
      if (characters && provider === 'voice_elevenlabs') {
        cost = characters * COST_ESTIMATES.voice_elevenlabs;
      }
      break;
      
    case 'video_clip_generated':
      if (duration) {
        const providerCost = COST_ESTIMATES[provider as keyof typeof COST_ESTIMATES];
        if (typeof providerCost === 'number') {
          cost = duration * providerCost;
        }
      }
      break;
      
    case 'video_assembled':
      if (provider === 'assembly_client') {
        cost = 0;
      } else {
        const assemblyCost = COST_ESTIMATES[provider as keyof typeof COST_ESTIMATES];
        if (typeof assemblyCost === 'number') {
          cost = assemblyCost;
        }
      }
      break;
  }
  
  return Math.round(cost * 100) / 100; // Round to 2 decimal places
}

/**
 * Create a usage event with automatic cost calculation
 */
export function createUsageEvent(
  type: UsageEventType,
  data: Omit<UsageEvent, 'type' | 'timestamp' | 'cost'>
): UsageEvent {
  const event: UsageEvent = {
    type,
    ...data,
    timestamp: new Date().toISOString(),
  };
  
  // Calculate cost if not provided
  if (event.cost === undefined) {
    event.cost = calculateCost(event);
  }
  
  return event;
}

/**
 * Usage tracker class for collecting and reporting usage metrics
 */
export class UsageTracker {
  private events: UsageEvent[] = [];
  private userId?: string;
  
  constructor(userId?: string) {
    this.userId = userId;
  }
  
  /**
   * Track a usage event
   */
  track(type: UsageEventType, data: Omit<UsageEvent, 'type' | 'timestamp' | 'userId'> = {}): UsageEvent {
    const event = createUsageEvent(type, {
      ...data,
      userId: this.userId,
    });
    
    this.events.push(event);
    
    // Log the event for debugging
    console.log(`[Usage] ${type}`, {
      provider: event.provider,
      cost: event.cost,
      duration: event.duration,
      tokens: event.tokens,
      characters: event.characters,
    });
    
    return event;
  }
  
  /**
   * Get all tracked events
   */
  getEvents(): UsageEvent[] {
    return [...this.events];
  }
  
  /**
   * Get usage summary
   */
  getSummary(): UsageSummary {
    const summary: UsageSummary = {
      totalVideos: 0,
      totalDurationSeconds: 0,
      totalLLMTokens: 0,
      totalTTSCharacters: 0,
      totalStorageBytes: 0,
      totalApiCalls: 0,
      estimatedCostCents: 0,
      byProvider: {},
    };
    
    for (const event of this.events) {
      // Update totals
      if (event.type === 'video_generated') summary.totalVideos++;
      if (event.duration) summary.totalDurationSeconds += event.duration;
      if (event.tokens) summary.totalLLMTokens += event.tokens;
      if (event.characters) summary.totalTTSCharacters += event.characters;
      if (event.bytes) summary.totalStorageBytes += event.bytes;
      if (event.type === 'api_call') summary.totalApiCalls++;
      if (event.cost) summary.estimatedCostCents += event.cost;
      
      // Track by provider
      if (event.provider) {
        if (!summary.byProvider[event.provider]) {
          summary.byProvider[event.provider] = { calls: 0, cost: 0 };
        }
        summary.byProvider[event.provider].calls++;
        summary.byProvider[event.provider].cost += event.cost || 0;
      }
    }
    
    // Round cost
    summary.estimatedCostCents = Math.round(summary.estimatedCostCents * 100) / 100;
    
    return summary;
  }
  
  /**
   * Clear tracked events
   */
  clear(): void {
    this.events = [];
  }
  
  /**
   * Export events as JSON for storage
   */
  toJSON(): string {
    return JSON.stringify({
      userId: this.userId,
      events: this.events,
      summary: this.getSummary(),
      exportedAt: new Date().toISOString(),
    });
  }
}

/**
 * Helper to format cost in dollars
 */
export function formatCostDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Helper to format storage size
 */
export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Helper to format duration
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export default { UsageTracker, createUsageEvent, calculateCost, formatCostDollars, formatStorageSize, formatDuration };
