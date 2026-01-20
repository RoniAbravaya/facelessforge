import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Generate a video clip using Runway Gen-2 (polling mode)
 * 
 * Runway uses synchronous polling - this function initiates generation,
 * polls for completion (up to 5 minutes), and returns the final video URL.
 * 
 * @returns {videoUrl}
 */

async function pollRunwayGeneration(taskId, apiKey, jobId, base44, maxAttempts = 60) {
  const startTime = Date.now();
  const maxDurationMs = 5 * 60 * 1000; // 5 minutes
  
  console.log(`[Runway] Starting polling for task ${taskId}`);
  
  for (let i = 0; i < maxAttempts; i++) {
    const elapsed = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);
    
    if (elapsed > maxDurationMs) {
      const elapsedMin = Math.floor(elapsed / 60000);
      throw new Error(`Runway polling timed out after ${elapsedMin} minutes`);
    }
    
    console.log(`[Runway] Poll attempt ${i + 1}/${maxAttempts} (${elapsedSeconds}s elapsed)`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s between polls
    
    const response = await fetch(`https://api.runwayml.com/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Runway] Poll error (${response.status}):`, errorText);
      throw new Error(`Failed to poll Runway generation: ${response.status}`);
    }
    
    const data = await response.json();
    const currentStatus = data.status || 'unknown';
    
    console.log(`[Runway] Status: ${currentStatus}, Attempt: ${i + 1}, Elapsed: ${elapsedSeconds}s`);
    
    // Log progress event
    if (jobId && base44) {
      await base44.asServiceRole.entities.JobEvent.create({
        job_id: jobId,
        level: 'info',
        step: 'video_clip_generation',
        event_type: 'step_progress',
        message: `Runway polling: attempt ${i + 1}, status=${currentStatus}, elapsed=${elapsedSeconds}s`,
        progress: null,
        data: { 
          provider: 'runway', 
          taskId, 
          attemptNumber: i + 1, 
          elapsedSeconds, 
          state: currentStatus 
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (data.status === 'SUCCEEDED') {
      const videoUrl = data.output?.[0] || data.artifacts?.[0]?.url;
      
      if (!videoUrl) {
        console.error('[Runway] Succeeded but no video URL:', JSON.stringify(data, null, 2));
        throw new Error('Runway generation completed but no video URL found');
      }
      
      console.log(`[Runway] ✅ Generation succeeded: ${videoUrl}`);
      return videoUrl;
    } else if (data.status === 'FAILED') {
      const errorMsg = data.failure || data.error || 'Unknown error';
      console.error(`[Runway] Generation failed:`, errorMsg);
      throw new Error(`Runway video generation failed: ${errorMsg}`);
    }
    
    console.log(`[Runway] Still processing (${currentStatus})`);
  }
  
  throw new Error('Runway generation timeout after 5 minutes');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { apiKey, prompt, duration, aspectRatio, jobId } = await req.json();
    
    console.log('[Runway] Starting generation');
    console.log(`[Runway] Prompt: ${prompt?.substring(0, 100)}...`);
    console.log(`[Runway] Duration: ${duration}s, Aspect Ratio: ${aspectRatio}`);
    
    if (!apiKey || !prompt) {
      throw new Error('Missing required parameters: apiKey, prompt');
    }
    
    // Retry logic for transient errors
    const maxRetries = 3;
    const retryDelays = [2000, 5000, 10000];
    let response;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      console.log(`[Runway] Attempt ${attempt + 1}/${maxRetries + 1}`);
      
      try {
        response = await fetch('https://api.runwayml.com/v1/gen2', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt_text: prompt,
            duration: Math.min(Number(duration), 10),
            ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '1:1'
          }),
          signal: AbortSignal.timeout(6 * 60 * 1000)
        });
        
        // Retry on transient errors
        if ([502, 503, 504].includes(response.status)) {
          const errorText = await response.text();
          console.warn(`[Runway] Transient error ${response.status} on attempt ${attempt + 1}`);
          
          if (attempt < maxRetries) {
            const delay = retryDelays[attempt];
            console.warn(`[Runway] Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
            continue;
          } else {
            throw new Error(`Runway API unavailable (${response.status}). Please try again later.`);
          }
        }
        
        break;
      } catch (fetchError) {
        if (fetchError.name === 'TimeoutError') {
          throw new Error('Runway generation request timed out after 6 minutes');
        }
        
        if (attempt < maxRetries && (fetchError.message?.includes('fetch') || fetchError.message?.includes('network'))) {
          const delay = retryDelays[attempt];
          console.warn(`[Runway] Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }
        
        throw fetchError;
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Runway] API error (${response.status}):`, errorText);
      
      try {
        const error = JSON.parse(errorText);
        throw new Error(`Runway API error: ${error.error?.message || error.message || errorText}`);
      } catch {
        throw new Error(`Runway API error (${response.status}): ${errorText}`);
      }
    }
    
    const data = await response.json();
    const taskId = data.id;
    
    console.log(`[Runway] Task initiated: ${taskId}`);
    
    // Poll for completion
    const videoUrl = await pollRunwayGeneration(taskId, apiKey, jobId, base44);
    
    console.log(`[Runway] ✅ Video generated: ${videoUrl}`);
    
    return Response.json({ videoUrl, provider: 'runway' });
    
  } catch (error) {
    console.error('[Runway] Error:', error.message);
    console.error('[Runway] Stack:', error.stack);
    return Response.json({ 
      error: error.message,
      provider: 'runway',
      details: error.stack 
    }, { status: 500 });
  }
});