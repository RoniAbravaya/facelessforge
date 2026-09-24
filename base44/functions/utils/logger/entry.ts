/**
 * Centralized logging utility for FacelessForge functions.
 * Provides consistent log formatting, correlation IDs, and structured logging.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  jobId?: string;
  projectId?: string;
  step?: string;
  provider?: string;
  sceneIndex?: number;
  [key: string]: unknown;
}

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => void;
  child: (context: LogContext) => Logger;
}

/**
 * Generate a correlation ID for request tracking
 */
export function generateCorrelationId(prefix = 'req'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format timestamp for logs
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format log message with context
 */
function formatLogMessage(
  level: LogLevel,
  message: string,
  context: LogContext,
  data?: Record<string, unknown>
): string {
  const timestamp = formatTimestamp();
  const contextParts: string[] = [];
  
  if (context.correlationId) contextParts.push(`cid=${context.correlationId}`);
  if (context.jobId) contextParts.push(`job=${context.jobId}`);
  if (context.projectId) contextParts.push(`project=${context.projectId}`);
  if (context.step) contextParts.push(`step=${context.step}`);
  if (context.provider) contextParts.push(`provider=${context.provider}`);
  if (context.sceneIndex !== undefined) contextParts.push(`scene=${context.sceneIndex}`);
  
  const contextStr = contextParts.length > 0 ? `[${contextParts.join('|')}]` : '';
  const levelStr = level.toUpperCase().padEnd(5);
  
  let logLine = `[${timestamp}] ${levelStr} ${contextStr} ${message}`;
  
  if (data && Object.keys(data).length > 0) {
    logLine += ` | data=${JSON.stringify(data)}`;
  }
  
  return logLine;
}

/**
 * Create a logger instance with optional context
 */
export function createLogger(initialContext: LogContext = {}): Logger {
  const context = { ...initialContext };
  
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const formattedMessage = formatLogMessage(level, message, context, data);
    
    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.log(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  };
  
  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => {
      const errorData = error instanceof Error 
        ? { errorMessage: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' -> ') }
        : error 
        ? { errorDetails: String(error) }
        : {};
      
      log('error', message, { ...errorData, ...data });
    },
    child: (childContext: LogContext) => {
      return createLogger({ ...context, ...childContext });
    }
  };
}

/**
 * Helper to create a request-scoped logger from a Deno request
 */
export function createRequestLogger(req: Request, functionName: string): Logger {
  const correlationId = generateCorrelationId(functionName);
  
  return createLogger({
    correlationId,
    step: functionName
  });
}

/**
 * User-friendly error messages for common errors
 */
export const ErrorMessages = {
  // API Errors
  INVALID_API_KEY: 'Invalid API key. Please check your integration settings.',
  RATE_LIMITED: 'Rate limit exceeded. Please try again in a few minutes.',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again later.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  TIMEOUT: 'Request timed out. Please try again.',
  
  // Input Errors
  MISSING_REQUIRED_FIELD: (field: string) => `Missing required field: ${field}`,
  INVALID_INPUT: (field: string, reason: string) => `Invalid ${field}: ${reason}`,
  
  // Resource Errors
  PROJECT_NOT_FOUND: 'Project not found. It may have been deleted.',
  JOB_NOT_FOUND: 'Job not found.',
  INTEGRATION_NOT_FOUND: 'Integration not found. Please configure it in settings.',
  ARTIFACT_NOT_FOUND: 'Artifact not found.',
  
  // Generation Errors
  SCRIPT_GENERATION_FAILED: 'Failed to generate script. Please try again with a different topic.',
  SCENE_PLANNING_FAILED: 'Failed to plan video scenes. Please adjust duration or topic.',
  VOICEOVER_FAILED: 'Failed to generate voiceover. Check your voice provider settings.',
  VIDEO_CLIP_FAILED: (scene: number) => `Failed to generate video clip for scene ${scene}.`,
  ASSEMBLY_FAILED: 'Failed to assemble final video. Try again or download clips manually.',
  
  // Provider-specific
  LUMA_QUEUE_FULL: 'Luma generation queue is full. Please wait for current jobs to complete.',
  ELEVENLABS_QUOTA: 'ElevenLabs character quota exceeded. Upgrade your plan or wait for reset.',
  OPENAI_CONTEXT_LENGTH: 'Script too long for AI model. Please use a shorter topic.',
};

/**
 * Parse error message and return user-friendly version
 */
export function getUserFriendlyError(error: Error | unknown, context?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  
  // API key errors
  if (lowerMessage.includes('api key') || lowerMessage.includes('unauthorized') || lowerMessage.includes('authentication')) {
    return ErrorMessages.INVALID_API_KEY;
  }
  
  // Rate limiting
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('429') || lowerMessage.includes('too many requests')) {
    return ErrorMessages.RATE_LIMITED;
  }
  
  // Service unavailable
  if (lowerMessage.includes('503') || lowerMessage.includes('502') || lowerMessage.includes('service unavailable')) {
    return ErrorMessages.SERVICE_UNAVAILABLE;
  }
  
  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('econnrefused')) {
    return ErrorMessages.NETWORK_ERROR;
  }
  
  // Timeout
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return ErrorMessages.TIMEOUT;
  }
  
  // If we have context, return a contextualized message
  if (context) {
    return `${context}: ${message}`;
  }
  
  // Return original message if no match
  return message;
}

export default { createLogger, createRequestLogger, generateCorrelationId, ErrorMessages, getUserFriendlyError };
