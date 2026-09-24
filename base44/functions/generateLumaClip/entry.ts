import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Generate a video clip using Luma Dream Machine (callback mode)
 * 
 * Luma uses asynchronous callbacks - this function initiates the generation
 * and creates a pending artifact. The actual video URL will be provided
 * via the lumaCallback webhook when generation completes.
 * 
 * @returns {generationId, status: 'pending', callbackUrl}
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { apiKey, prompt, duration, aspectRatio, jobId, projectId, sceneIndex } = await req.json();
    
    console.log('[Luma] Starting generation');
    console.log(`[Luma] Prompt: ${prompt?.substring(0, 100)}...`);
    console.log(`[Luma] Duration: ${duration}s, Aspect Ratio: ${aspectRatio}`);
    
    if (!apiKey || !prompt || !jobId || !projectId || sceneIndex === undefined) {
      throw new Error('Missing required parameters: apiKey, prompt, jobId, projectId, sceneIndex');
    }
    
    // Map requested duration to Luma-supported values (5s, 9s, or 10s)
    let lumaDuration;
    const durationNum = Math.max(4, Math.min(8, Math.round(Number(duration))));
    if (durationNum <= 5) {
      lumaDuration = 5;
    } else if (durationNum <= 9) {
      lumaDuration = 9;
    } else {
      lumaDuration = 10;
    }
    console.log(`[Luma] Duration mapping: ${durationNum}s -> ${lumaDuration}s (Luma supports only 5s, 9s, 10s)`);
    
    // Construct callback URL using environment configuration
    const appBaseUrl = Deno.env.get('BASE44_APP_BASE_URL') || `https://${req.headers.get('host')}`;
    const callbackUrl = `${appBaseUrl}/api/functions/lumaCallback?jobId=${jobId}&sceneIndex=${sceneIndex}&projectId=${projectId}`;
    
    console.log(`[Luma] Callback URL: ${callbackUrl}`);
    
    if (!appBaseUrl || appBaseUrl.includes('undefined')) {
      console.warn('[Luma] ⚠️ WARNING: Callback URL may be invalid - missing environment configuration');
    }
    
    // Build request body
    const lumaBody = {
      model: 'ray-2',
      prompt: prompt,
      duration: `${lumaDuration}s`,
      resolution: '720p',
      callback_url: callbackUrl
    };
    
    if (aspectRatio === '16:9' || aspectRatio === '9:16') {
      lumaBody.aspect_ratio = aspectRatio;
    }
    
    // Retry logic for transient errors
    const maxRetries = 3;
    const retryDelays = [2000, 5000, 10000]; // ms
    let response;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      console.log(`[Luma] Attempt ${attempt + 1}/${maxRetries + 1}`);
      
      try {
        response = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations/video', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'accept': 'application/json'
          },
          body: JSON.stringify(lumaBody),
          signal: AbortSignal.timeout(6 * 60 * 1000) // 6 minute timeout
        });
        
        // Retry on transient errors (429, 500, 502, 503, 504)
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          const errorText = await response.text();
          console.warn(`[Luma] Transient error ${response.status} on attempt ${attempt + 1}:`, errorText);
          
          if (attempt < maxRetries) {
            const delay = response.status === 429 ? 30000 : retryDelays[attempt];
            console.warn(`[Luma] Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
            continue;
          } else {
            throw new Error(`LUMA_TRANSIENT_ERROR: Luma API unavailable (${response.status}) after ${maxRetries + 1} attempts`);
          }
        }
        
        break; // Success or non-transient error
      } catch (fetchError) {
        if (fetchError.name === 'TimeoutError') {
          throw new Error('Luma generation request timed out after 6 minutes');
        }
        
        if (attempt < maxRetries && (fetchError.message?.includes('fetch') || fetchError.message?.includes('network'))) {
          const delay = retryDelays[attempt];
          console.warn(`[Luma] Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }
        
        throw fetchError;
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Luma] API error (${response.status}):`, errorText);
      
      try {
        const error = JSON.parse(errorText);
        throw new Error(`Luma API error: ${error.error?.message || error.message || error.detail || errorText}`);
      } catch (parseError) {
        throw new Error(`Luma API error (${response.status}): ${errorText}`);
      }
    }
    
    const data = await response.json();
    const generationId = data.id;
    
    if (!generationId) {
      throw new Error(`Luma response missing generation ID: ${JSON.stringify(data)}`);
    }
    
    console.log(`[Luma] ✅ Generation initiated: ${generationId}`);
    console.log(`[Luma] Callback will be sent to: ${callbackUrl}`);
    
    // Create pending artifact to track this generation
    await base44.asServiceRole.entities.Artifact.create({
      job_id: jobId,
      project_id: projectId,
      artifact_type: 'video_clip_pending',
      scene_index: sceneIndex,
      metadata: {
        provider: 'luma',
        generation_id: generationId,
        status: 'pending',
        initiated_at: new Date().toISOString()
      }
    });
    
    console.log(`[Luma] Created pending artifact for scene ${sceneIndex}`);
    
    return Response.json({
      generationId,
      status: 'pending',
      callbackUrl,
      message: 'Luma generation initiated - callback will process completion'
    });
    
  } catch (error) {
    console.error('[Luma] Error:', error.message);
    console.error('[Luma] Stack:', error.stack);
    return Response.json({ 
      error: error.message,
      provider: 'luma',
      details: error.stack 
    }, { status: 500 });
  }
});