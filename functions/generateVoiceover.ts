/**
 * Generate voiceover audio using text-to-speech providers.
 * Supports ElevenLabs with automatic voice selection and retry logic.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createRequestLogger, getUserFriendlyError, ErrorMessages } from './utils/logger.ts';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // milliseconds

async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  logger: ReturnType<typeof createRequestLogger>,
  context: string
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1];
        logger.info(`Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`, { context });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const response = await fetch(url, options);
      
      // Retry on transient errors
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const errorText = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
        
        if (response.status === 429) {
          logger.warn('Rate limited, backing off', { status: response.status, attempt });
          await new Promise(resolve => setTimeout(resolve, 30000)); // 30s backoff for rate limiting
        }
        
        if (attempt < MAX_RETRIES) continue;
      }
      
      return response;
    } catch (fetchError) {
      lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      
      if (lastError.message?.includes('fetch') || lastError.message?.includes('network')) {
        logger.warn('Network error, retrying', { error: lastError.message, attempt });
        if (attempt < MAX_RETRIES) continue;
      }
      
      throw lastError;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

Deno.serve(async (req) => {
  const logger = createRequestLogger(req, 'generateVoiceover');
  const base44 = createClientFromRequest(req);

  try {
    const { apiKey, providerType, text, language } = await req.json();
    
    // Input validation
    if (!apiKey) {
      logger.error('Missing API key');
      return Response.json({ error: ErrorMessages.MISSING_REQUIRED_FIELD('apiKey') }, { status: 400 });
    }
    
    if (!text || text.trim().length === 0) {
      logger.error('Missing or empty text');
      return Response.json({ error: ErrorMessages.MISSING_REQUIRED_FIELD('text') }, { status: 400 });
    }
    
    logger.info('Starting voiceover generation', { 
      providerType, 
      textLength: text.length,
      language 
    });

    if (providerType === 'voice_elevenlabs') {
      // Get available voices
      logger.info('Fetching available voices');
      const voicesResponse = await fetchWithRetry(
        'https://api.elevenlabs.io/v1/voices',
        { headers: { 'xi-api-key': apiKey } },
        logger,
        'fetch_voices'
      );

      if (!voicesResponse.ok) {
        const errorText = await voicesResponse.text();
        logger.error('Failed to fetch voices', null, { status: voicesResponse.status, error: errorText });
        
        if (voicesResponse.status === 401) {
          throw new Error(ErrorMessages.INVALID_API_KEY);
        }
        throw new Error(`Failed to fetch ElevenLabs voices: ${errorText}`);
      }

      const voicesData = await voicesResponse.json();
      const voices = voicesData.voices || [];
      
      // Select first available voice or a good default
      const selectedVoice = voices[0]?.voice_id || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice as fallback
      const selectedVoiceName = voices[0]?.name || 'Rachel (default)';
      
      logger.info('Voice selected', { voiceId: selectedVoice, voiceName: selectedVoiceName, availableVoices: voices.length });

      // Generate audio
      logger.info('Generating audio', { voiceId: selectedVoice, textLength: text.length });
      const ttsStartTime = Date.now();
      
      const response = await fetchWithRetry(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        },
        logger,
        'generate_tts'
      );

      const ttsTime = Date.now() - ttsStartTime;

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('TTS generation failed', null, { status: response.status, error: errorText, ttsTime });
        
        // Parse ElevenLabs-specific errors
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.detail?.status === 'quota_exceeded') {
            throw new Error(ErrorMessages.ELEVENLABS_QUOTA);
          }
          if (errorData.detail?.status === 'invalid_api_key') {
            throw new Error(ErrorMessages.INVALID_API_KEY);
          }
          throw new Error(`ElevenLabs error: ${errorData.detail?.message || errorText}`);
        } catch (parseError) {
          if (parseError instanceof Error && parseError.message.includes('ElevenLabs')) {
            throw parseError;
          }
          throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
        }
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioSizeKB = Math.round(audioBlob.size / 1024);
      
      logger.info('Audio generated', { 
        sizeKB: audioSizeKB, 
        ttsTimeMs: ttsTime,
        contentType: audioBlob.type 
      });
      
      // Convert blob to file for upload
      const audioFile = new File([audioBlob], 'voiceover.mp3', { type: 'audio/mpeg' });
      
      // Upload to Base44 storage
      logger.info('Uploading audio to storage');
      const uploadStartTime = Date.now();
      
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
        file: audioFile
      });
      
      const uploadTime = Date.now() - uploadStartTime;
      
      logger.info('Voiceover generation complete', { 
        audioUrl: uploadResult.file_url,
        totalTimeMs: Date.now() - ttsStartTime,
        uploadTimeMs: uploadTime,
        sizeKB: audioSizeKB
      });

      return Response.json({ 
        audioUrl: uploadResult.file_url,
        metadata: {
          voiceId: selectedVoice,
          voiceName: selectedVoiceName,
          durationEstimate: Math.round(text.length / 15), // Rough estimate: ~15 chars/second
          sizeKB: audioSizeKB
        }
      });
    }

    logger.error('Unsupported voice provider', null, { providerType });
    throw new Error(`Unsupported voice provider: ${providerType}. Supported: voice_elevenlabs`);

  } catch (error) {
    logger.error('Voiceover generation failed', error);
    
    const userMessage = getUserFriendlyError(error, 'Voiceover generation');
    return Response.json({ 
      error: userMessage,
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});