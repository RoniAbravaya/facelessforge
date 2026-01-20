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
        console.error(`[Veo] Generation failed:`, data.error);
        throw new Error(`Veo generation failed: ${data.error.message}`);
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
    
    // Map duration to Veo-supported values (4, 6, or 8)
    const rawDuration = Math.round(Number(duration));
    let finalDuration = 8;
    if (rawDuration <= 4) {
      finalDuration = 4;
    } else if (rawDuration <= 6) {
      finalDuration = 6;
    } else {
      finalDuration = 8;
    }
    console.log(`[Veo] Duration mapping: ${rawDuration}s -> ${finalDuration}s (Veo supports 4s, 6s, 8s)`);
    
    const requestBody = {
      instances: [{
        prompt: prompt
      }],
      parameters: {
        aspectRatio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '16:9',
        durationSeconds: finalDuration
      }
    };
    
    // Retry logic for internal server errors
    const maxRetries = 2; // Retry up to 2 times on internal errors
    const retryDelay = 5000; // 5 seconds between retries
    
    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
      try {
        if (retryCount > 0) {
          console.log(`[Veo] Retry ${retryCount}/${maxRetries} after internal error`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
        // Transient error retry for API call
        const maxApiRetries = 3;
        const apiRetryDelays = [2000, 5000, 10000];
        let response;
        
        for (let attempt = 0; attempt <= maxApiRetries; attempt++) {
          console.log(`[Veo] API attempt ${attempt + 1}/${maxApiRetries + 1} (retry ${retryCount}/${maxRetries})`);
          
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
            
            // Retry on transient errors
            if ([502, 503, 504].includes(response.status)) {
              const errorText = await response.text();
              console.warn(`[Veo] Transient error ${response.status} on attempt ${attempt + 1}`);
              
              if (attempt < maxApiRetries) {
                const delay = apiRetryDelays[attempt];
                console.warn(`[Veo] Retrying API call in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
                continue;
              } else {
                throw new Error(`VEO_TRANSIENT_ERROR: Veo API unavailable (${response.status})`);
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
          
          // Check if this is an internal server error that should be retried
          if ([500, 502, 503, 504].includes(statusCode) || errorText.includes('internal server issue')) {
            if (retryCount < maxRetries) {
              console.warn(`[Veo] Internal server error detected, will retry generation (${retryCount + 1}/${maxRetries})`);
              continue; // Retry the entire generation
            } else {
              throw new Error(`Veo internal server error after ${maxRetries + 1} attempts (${statusCode}): ${errorText}`);
            }
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
        
        console.log(`[Veo] Operation initiated: ${operationName}`);
        
        // Poll for completion (with internal error retry)
        try {
          const videoUrl = await pollVeoGeneration(operationName, apiKey, geminiApiKey, base44, jobId);
          
          console.log(`[Veo] ✅ Video generated: ${videoUrl}`);
          return Response.json({ videoUrl, provider: 'veo' });
          
        } catch (pollError) {
          // Check if polling failed due to internal error
          const errorMsg = pollError.message || '';
          if ((errorMsg.includes('internal server issue') || errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504')) && retryCount < maxRetries) {
            console.warn(`[Veo] Polling failed with internal error, will retry generation (${retryCount + 1}/${maxRetries})`);
            continue; // Retry the entire generation
          }
          
          throw pollError; // Non-retryable polling error
        }
        
      } catch (generationError) {
        // Check if this is the last retry
        if (retryCount >= maxRetries) {
          throw generationError;
        }
        
        // Check if error is retryable
        const errorMsg = generationError.message || '';
        if (errorMsg.includes('internal server issue') || errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504')) {
          console.warn(`[Veo] Generation error (retry ${retryCount + 1}/${maxRetries}):`, errorMsg);
          continue; // Retry
        }
        
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