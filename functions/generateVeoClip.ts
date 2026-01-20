import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Generate a video clip using Google Veo (polling mode with retry on internal errors)
 * 
 * Veo uses synchronous polling - this function initiates generation,
 * polls for completion (up to 6 minutes), and returns the final video URL.
 * 
 * Includes retry logic for internal server errors (500/502/503/504).
 * 
 * @returns {videoUrl}
 */

async function pollVeoGeneration(operationName, veoApiKey, geminiApiKey, base44, jobId, maxAttempts = 72) {
  const startTime = Date.now();
  const maxDurationMs = 6 * 60 * 1000; // 6 minutes
  
  console.log(`[Veo] Starting polling for operation ${operationName}`);
  
  for (let i = 0; i < maxAttempts; i++) {
    const elapsed = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);
    
    if (elapsed > maxDurationMs) {
      const elapsedMin = Math.floor(elapsed / 60000);
      throw new Error(`Veo polling timed out after ${elapsedMin} minutes`);
    }
    
    console.log(`[Veo] Poll attempt ${i + 1}/${maxAttempts} (${elapsedSeconds}s elapsed)`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s between polls
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}`, {
      headers: {
        'x-goog-api-key': veoApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Veo] Poll error (${response.status}):`, errorText);
      throw new Error(`Failed to poll Veo generation: ${response.status}`);
    }
    
    const data = await response.json();
    const isDone = data.done || false;
    const currentState = isDone ? 'done' : 'processing';
    
    console.log(`[Veo] State: ${currentState}, Attempt: ${i + 1}, Elapsed: ${elapsedSeconds}s`);
    
    // Log progress event
    if (jobId && base44) {
      await base44.asServiceRole.entities.JobEvent.create({
        job_id: jobId,
        level: 'info',
        step: 'video_clip_generation',
        event_type: 'step_progress',
        message: `Veo polling: attempt ${i + 1}, state=${currentState}, elapsed=${elapsedSeconds}s`,
        progress: null,
        data: { 
          provider: 'veo', 
          operationName, 
          attemptNumber: i + 1, 
          elapsedSeconds, 
          state: currentState 
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (data.done) {
      if (data.error) {
        const errorStatus = data.error.status || '';
        const errorMessage = data.error.message || '';
        
        console.error(`[Veo] Generation error (status: ${errorStatus}):`, data.error);
        
        // Check if this is an internal/transient error that should be retried
        if (errorStatus === 'INTERNAL' || errorMessage.toLowerCase().includes('internal server issue')) {
          console.warn(`[Veo] ⚠️ Transient internal error detected - marking for retry`);
          const error = new Error(`VEO_INTERNAL_ERROR: ${errorMessage}`);
          error.isTransient = true;
          error.errorDetails = data.error;
          throw error;
        }
        
        throw new Error(`Veo generation failed: ${errorMessage}`);
      }
      
      // Check for inline data first
      const inlineData = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.inlineData?.data;
      if (inlineData) {
        console.log(`[Veo] Extracting inline base64 data (${inlineData.length} chars)`);
        
        const videoBytes = Uint8Array.from(atob(inlineData), c => c.charCodeAt(0));
        console.log(`[Veo] Converted to bytes: ${(videoBytes.length / 1024 / 1024).toFixed(2)} MB`);
        
        const videoFile = new File([videoBytes], 'veo_clip.mp4', { type: 'video/mp4' });
        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: videoFile });
        
        console.log(`[Veo] ✅ Uploaded inline clip: ${uploadResult.file_url}`);
        return uploadResult.file_url;
      }
      
      // Otherwise, download from Files API
      const fileUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!fileUri) {
        console.error(`[Veo] Completed but no video data:`, JSON.stringify(data, null, 2));
        throw new Error('Veo generation completed but no video data found');
      }
      
      console.log(`[Veo] Downloading from Files API: ${fileUri}`);
      
      if (!geminiApiKey) {
        throw new Error('Gemini API Key required to download Veo clips. Add it in Integrations page.');
      }
      
      // Construct download URL
      let downloadUrl = fileUri;
      if (!/^https?:\/\//.test(fileUri)) {
        downloadUrl = `https://generativelanguage.googleapis.com/v1beta/${fileUri}`;
      }
      
      const urlObj = new URL(downloadUrl);
      urlObj.searchParams.set('key', geminiApiKey);
      downloadUrl = urlObj.toString();
      
      // Download with retry on 404
      let downloadResponse = await fetch(downloadUrl, { method: 'GET' });
      
      if (!downloadResponse.ok && downloadResponse.status === 404) {
        console.warn('[Veo] Received 404; waiting 5s before retry...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        downloadResponse = await fetch(downloadUrl, { method: 'GET' });
      }
      
      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        console.error(`[Veo] Download failed (${downloadResponse.status}):`, errorText);
        
        if (downloadResponse.status === 403) {
          if (errorText.includes('SERVICE_DISABLED') || errorText.includes('disabled')) {
            throw new Error('Your Google Cloud project must have Generative Language API enabled. Go to console.cloud.google.com, enable the API, then add that project\'s key in Integrations.');
          }
          throw new Error('Gemini API access denied. Verify your API key has Generative Language API enabled and add it in Integrations.');
        }
        throw new Error(`Failed to download Veo clip (${downloadResponse.status}): ${errorText}`);
      }
      
      const videoBytes = new Uint8Array(await downloadResponse.arrayBuffer());
      console.log(`[Veo] Downloaded ${(videoBytes.length / 1024 / 1024).toFixed(2)} MB`);
      
      const videoFile = new File([videoBytes], 'veo_clip.mp4', { type: 'video/mp4' });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: videoFile });
      
      console.log(`[Veo] ✅ Uploaded downloaded clip: ${uploadResult.file_url}`);
      return uploadResult.file_url;
    }
  }
  
  throw new Error('Veo generation timeout after 6 minutes');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { apiKey, geminiApiKey, prompt, duration, aspectRatio, jobId } = await req.json();
    
    console.log('[Veo] Starting generation');
    console.log(`[Veo] Prompt: ${prompt?.substring(0, 100)}...`);
    console.log(`[Veo] Duration: ${duration}s, Aspect Ratio: ${aspectRatio}`);
    
    if (!apiKey || !prompt) {
      throw new Error('Missing required parameters: apiKey, prompt');
    }
    
    // Map duration to Veo-supported values (4, 6, or 8) - MUST be numeric
    const rawDuration = Number(duration);
    let finalDuration;
    if (rawDuration <= 4) {
      finalDuration = 4;
    } else if (rawDuration > 4 && rawDuration <= 6) {
      finalDuration = 6;
    } else {
      finalDuration = 8;
    }
    console.log(`[Veo] Duration mapping: ${rawDuration}s -> ${finalDuration} (numeric, Veo supports 4, 6, or 8)`);
    
    const requestBody = {
      instances: [{
        prompt: prompt
      }],
      parameters: {
        aspectRatio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '16:9',
        durationSeconds: finalDuration // MUST be number, not string
      }
    };
    
    console.log(`[Veo] Request body:`, JSON.stringify(requestBody, null, 2));
    console.log(`[Veo] durationSeconds type: ${typeof requestBody.parameters.durationSeconds}, value: ${requestBody.parameters.durationSeconds}`);
    
    // Retry logic for internal server errors
    const maxGenerationRetries = 2; // Retry up to 2 times on internal errors
    const generationRetryDelay = 10000; // 10 seconds between generation retries
    
    for (let retryCount = 0; retryCount <= maxGenerationRetries; retryCount++) {
      try {
        if (retryCount > 0) {
          console.log(`[Veo] 🔄 Generation retry ${retryCount}/${maxGenerationRetries} after internal error (waiting ${generationRetryDelay/1000}s)`);
          await new Promise(resolve => setTimeout(resolve, generationRetryDelay));
        }
        
        console.log(`[Veo] Starting generation attempt ${retryCount + 1}/${maxGenerationRetries + 1}`);
        
        // Transient error retry for API call
        const maxApiRetries = 3;
        const apiRetryDelays = [2000, 5000, 10000];
        let response;
        
        for (let attempt = 0; attempt <= maxApiRetries; attempt++) {
          const attemptStartTime = Date.now();
          console.log(`[Veo] API attempt ${attempt + 1}/${maxApiRetries + 1} (generation retry ${retryCount}/${maxRetries})`);
          console.log(`[Veo] Request params: duration=${finalDuration} (${typeof finalDuration}), aspectRatio=${requestBody.parameters.aspectRatio}`);
          
          try {
            response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning', {
              method: 'POST',
              headers: {
                'x-goog-api-key': apiKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(requestBody),
              signal: AbortSignal.timeout(6 * 60 * 1000)
            });
            
            const attemptElapsed = Math.floor((Date.now() - attemptStartTime) / 1000);
            console.log(`[Veo] API response received after ${attemptElapsed}s - Status: ${response.status}`);
            
            // Retry on transient errors (500, 502, 503, 504)
            if ([500, 502, 503, 504].includes(response.status)) {
              const errorText = await response.text();
              console.warn(`[Veo] ⚠️ Transient error ${response.status} on API attempt ${attempt + 1}/${maxApiRetries + 1}`);
              console.warn(`[Veo] Error details: ${errorText.substring(0, 200)}`);
              
              if (attempt < maxApiRetries) {
                const delay = apiRetryDelays[attempt];
                console.warn(`[Veo] Will retry API call in ${delay}ms (${Math.floor(delay/1000)}s)...`);
                await new Promise(res => setTimeout(res, delay));
                continue;
              } else {
                throw new Error(`VEO_TRANSIENT_ERROR: Veo API unavailable (${response.status}) after ${maxApiRetries + 1} attempts`);
              }
            }
            
            break;
          } catch (fetchError) {
            if (fetchError.name === 'TimeoutError') {
              throw new Error('Veo generation request timed out after 6 minutes');
            }
            
            if (attempt < maxApiRetries && (fetchError.message?.includes('fetch') || fetchError.message?.includes('network'))) {
              const delay = apiRetryDelays[attempt];
              console.warn(`[Veo] Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
              await new Promise(res => setTimeout(res, delay));
              continue;
            }
            
            throw fetchError;
          }
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          const statusCode = response.status;
          
          console.error(`[Veo] API error (${statusCode}):`, errorText);
          console.error(`[Veo] Failed request body:`, JSON.stringify(requestBody, null, 2));
          
          // Check if this is an internal server error that should be retried
          if ([500, 502, 503, 504].includes(statusCode) || errorText.includes('internal server issue')) {
            if (retryCount < maxGenerationRetries) {
              console.warn(`[Veo] ⚠️ Internal server error (${statusCode}) detected, will retry generation (attempt ${retryCount + 1}/${maxGenerationRetries}) after ${generationRetryDelay}ms delay`);
              continue; // Retry the entire generation
            } else {
              throw new Error(`Veo internal server error after ${maxGenerationRetries + 1} attempts (${statusCode}): ${errorText}`);
            }
          }
          
          // Check for durationSeconds validation error
          if (statusCode === 400 && errorText.includes('durationSeconds') && errorText.includes('needs to be a number')) {
            console.error(`[Veo] ❌ CRITICAL: durationSeconds validation failed`);
            console.error(`[Veo] Current durationSeconds: ${requestBody.parameters.durationSeconds} (type: ${typeof requestBody.parameters.durationSeconds})`);
            
            // Force numeric value and retry once
            if (retryCount === 0) {
              console.warn(`[Veo] Forcing durationSeconds to numeric value and retrying...`);
              requestBody.parameters.durationSeconds = Number(finalDuration);
              continue;
            }
            
            throw new Error(`Veo API error: durationSeconds must be a number. Current value: ${requestBody.parameters.durationSeconds} (${typeof requestBody.parameters.durationSeconds})`);
          }
          
          // Non-retryable error
          try {
            const error = JSON.parse(errorText);
            throw new Error(`Veo API error: ${error.error?.message || error.message || errorText}`);
          } catch {
            throw new Error(`Veo API error (${statusCode}): ${errorText}`);
          }
        }
        
        const data = await response.json();
        const operationName = data.name;
        
        console.log(`[Veo] Operation initiated: ${operationName} (attempt ${retryCount + 1}/${maxGenerationRetries + 1})`);
        
        // Poll for completion (with internal error retry)
        try {
          const videoUrl = await pollVeoGeneration(operationName, apiKey, geminiApiKey, base44, jobId);
          
          console.log(`[Veo] ✅ Video generated successfully: ${videoUrl}`);
          return Response.json({ videoUrl, provider: 'veo' });
          
        } catch (pollError) {
          // Check if polling failed due to transient internal error
          const isTransient = pollError.isTransient || 
                             pollError.message?.includes('VEO_INTERNAL_ERROR') ||
                             pollError.message?.includes('internal server issue') ||
                             pollError.message?.includes('500') || 
                             pollError.message?.includes('502') || 
                             pollError.message?.includes('503') || 
                             pollError.message?.includes('504');
          
          if (isTransient && retryCount < maxGenerationRetries) {
            console.warn(`[Veo] ⚠️ Polling failed with transient error (attempt ${retryCount + 1}/${maxGenerationRetries + 1}): ${pollError.message}`);
            console.warn(`[Veo] Will retry entire generation after ${generationRetryDelay/1000}s delay`);
            continue; // Retry the entire generation
          }
          
          console.error(`[Veo] ❌ Polling failed with non-retryable error or retries exhausted: ${pollError.message}`);
          throw pollError; // Non-retryable or final retry failure
        }
        
      } catch (generationError) {
        // Check if this is the last retry
        if (retryCount >= maxGenerationRetries) {
          console.error(`[Veo] ❌ All ${maxGenerationRetries + 1} generation attempts failed`);
          throw generationError;
        }
        
        // Check if error is retryable (transient)
        const isTransient = generationError.isTransient ||
                           generationError.message?.includes('VEO_INTERNAL_ERROR') ||
                           generationError.message?.includes('internal server issue') ||
                           generationError.message?.includes('500') || 
                           generationError.message?.includes('502') || 
                           generationError.message?.includes('503') || 
                           generationError.message?.includes('504');
        
        if (isTransient) {
          console.warn(`[Veo] ⚠️ Generation failed with transient error (attempt ${retryCount + 1}/${maxGenerationRetries + 1}):`, generationError.message);
          console.warn(`[Veo] Will retry entire generation after ${generationRetryDelay/1000}s delay`);
          continue; // Retry
        }
        
        console.error(`[Veo] ❌ Generation failed with non-retryable error:`, generationError.message);
        throw generationError; // Non-retryable error
      }
    }
    
    // Should not reach here
    throw new Error('Veo generation failed after all retries');
    
  } catch (error) {
    console.error('[Veo] Error:', error.message);
    console.error('[Veo] Stack:', error.stack);
    return Response.json({ 
      error: error.message,
      provider: 'veo',
      details: error.stack 
    }, { status: 500 });
  }
});