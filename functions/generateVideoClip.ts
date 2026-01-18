import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function pollLumaGeneration(generationId, apiKey, maxAttempts = 60) {
  console.log(`[Luma Polling] Starting polling for generation ${generationId}`);
  console.log(`[Luma Polling] Max attempts: ${maxAttempts}, 5 seconds per attempt = ${maxAttempts * 5}s max wait`);
  
  for (let i = 0; i < maxAttempts; i++) {
    console.log(`[Luma Polling] Attempt ${i + 1}/${maxAttempts} - waiting 5 seconds before poll...`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    try {
      const pollUrl = `https://api.lumalabs.ai/dream-machine/v1/generations/${generationId}`;
      console.log(`[Luma Polling] Making request to ${pollUrl}`);
      
      const response = await fetch(pollUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      console.log(`[Luma Polling] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Luma Polling] Error response (${response.status}):`, errorText);
        throw new Error(`Failed to poll Luma generation: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Luma Polling] Full response data:`, JSON.stringify(data, null, 2));
      console.log(`[Luma Polling] State: ${data.state}`);
      
      if (data.state === 'completed') {
        const videoUrl = data.assets?.video || data.video_url;
        console.log(`[Luma Polling] Generation completed! Video URL:`, videoUrl);
        if (!videoUrl) {
          console.error('Luma completed but no video URL:', data);
          throw new Error('Luma generation completed but no video URL found');
        }
        return videoUrl;
      } else if (data.state === 'failed') {
        const errorMsg = data.failure_reason || 'Unknown error';
        console.error(`[Luma Polling] Generation failed:`, errorMsg);
        throw new Error(`Luma video generation failed: ${errorMsg}`);
      }
      
      console.log(`[Luma Polling] Still processing... (${data.state})`);
      // Still processing, continue polling
    } catch (pollError) {
      console.error(`[Luma Polling] Error during poll attempt ${i + 1}:`, pollError.message);
      throw pollError;
    }
  }

  throw new Error(`Luma generation timeout after ${maxAttempts * 5}s`);
}

async function pollRunwayGeneration(taskId, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const response = await fetch(`https://api.runwayml.com/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Runway polling error (${response.status}):`, errorText);
      throw new Error(`Failed to poll Runway generation: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Runway status (attempt ${i + 1}/${maxAttempts}):`, data.status);
    
    if (data.status === 'SUCCEEDED') {
      const videoUrl = data.output?.[0] || data.artifacts?.[0]?.url;
      if (!videoUrl) {
        console.error('Runway completed but no video URL:', data);
        throw new Error('Runway generation completed but no video URL found');
      }
      return videoUrl;
    } else if (data.status === 'FAILED') {
      const errorMsg = data.failure || data.error || 'Unknown error';
      console.error('Runway generation failed:', errorMsg);
      throw new Error(`Runway video generation failed: ${errorMsg}`);
    }
  }

  throw new Error('Runway generation timeout after 5 minutes');
}

async function pollVeoGeneration(operationName, apiKey, maxAttempts = 72) {
  for (let i = 0; i < maxAttempts; i++) {
    // Veo can take up to 6 minutes, poll every 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}`, {
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Veo polling error (${response.status}):`, errorText);
      throw new Error(`Failed to poll Veo generation: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Veo status (attempt ${i + 1}/${maxAttempts}):`, data.done ? 'done' : 'processing');
    
    if (data.done) {
      if (data.error) {
        console.error('Veo generation failed:', data.error);
        throw new Error(`Veo generation failed: ${data.error.message}`);
      }
      const videoUrl = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!videoUrl) {
        console.error('Veo completed but no video URL:', data);
        throw new Error('Veo generation completed but no video URL found');
      }
      return videoUrl;
    }
  }

  throw new Error('Veo generation timeout after 6 minutes');
}



Deno.serve(async (req) => {
  try {
    const { apiKey, providerType, prompt, duration, aspectRatio } = await req.json();

    // Ensure duration is an integer and valid (4-8 seconds)
    const parsedDuration = Number(duration);
    console.log(`RAW duration value:`, { duration, parsedDuration, type: typeof duration });
    const durationNum = Math.max(4, Math.min(8, Math.round(parsedDuration)));

    console.log('=== Generate Video Clip Request ===');
    console.log(`Provider: ${providerType}`);
    console.log(`Prompt: ${prompt?.substring(0, 150)}...`);
    console.log(`Duration after clamping: ${durationNum}s (raw: ${duration}, parsed: ${parsedDuration}), Aspect Ratio: ${aspectRatio}`);
    
    if (!apiKey) {
      throw new Error(`API key is missing for provider: ${providerType}`);
    }
    
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Video prompt is empty');
    }

    if (providerType === 'video_luma') {
      console.log('=== LUMA VIDEO GENERATION START ===');
      console.log(`Full API key: ${apiKey}`);
      console.log(`API key type: ${typeof apiKey}`);
      console.log(`API key length: ${apiKey?.length}`);

      // Start Luma generation
      const lumaHeaders = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      };

      console.log('Building Luma request body...');
      const lumaBody = {
        model: 'ray-2',
        prompt: prompt,
        duration: `${durationNum}s`,
        resolution: '720p'
      };

      console.log(`Luma body keys:`, Object.keys(lumaBody));
      console.log(`Luma body types:`, {
        model: typeof lumaBody.model,
        prompt: typeof lumaBody.prompt,
        duration: typeof lumaBody.duration,
        resolution: typeof lumaBody.resolution
      });

      // Add optional parameters if specified
      if (aspectRatio === '16:9' || aspectRatio === '9:16') {
        lumaBody.aspect_ratio = aspectRatio;
      }

      const requestUrl = 'https://api.lumalabs.ai/dream-machine/v1/generations/video';
      const requestBody = JSON.stringify(lumaBody);

      console.log('=== LUMA API REQUEST ===');
      console.log(`Full URL: ${requestUrl}`);
      console.log(`Method: POST`);
      console.log(`Full Headers:`, JSON.stringify(lumaHeaders, null, 2));
      console.log(`Full Body: ${requestBody}`);
      console.log(`Body length: ${requestBody.length} bytes`);
      console.log(`Prompt: "${prompt}"`);
      console.log(`Duration: ${durationNum}s (type: ${typeof durationNum}, value: ${durationNum})`);
      console.log(`API Key first 50 chars: ${apiKey.substring(0, 50)}`);
      console.log(`API Key last 50 chars: ${apiKey.substring(Math.max(0, apiKey.length - 50))}`);

      console.log('Making fetch request...');
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: lumaHeaders,
        body: requestBody
      });

      console.log(`Fetch completed, status: ${response.status}`);

      console.log(`Response Status: ${response.status} ${response.statusText}`);
      console.log(`All Response Headers:`, {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
        'x-request-id': response.headers.get('x-request-id'),
        'date': response.headers.get('date'),
        'cache-control': response.headers.get('cache-control'),
        'server': response.headers.get('server')
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('=== LUMA API ERROR ===');
        console.error(`Status Code: ${response.status}`);
        console.error(`Status Text: ${response.statusText}`);
        console.error(`Raw error text: "${errorText}"`);
        console.error(`Error text length: ${errorText.length} chars`);
        console.error(`Error text as bytes: ${Buffer.byteLength(errorText, 'utf-8')} bytes`);
        console.error(`Error text charCodes:`, errorText.split('').map(c => c.charCodeAt(0)));

        try {
          const error = JSON.parse(errorText);
          console.error(`Successfully parsed as JSON:`, JSON.stringify(error, null, 2));
          console.error(`Error keys:`, Object.keys(error));
          console.error(`Error detail:`, error.detail);
          console.error(`Error message:`, error.message);
          throw new Error(`Luma API error: ${error.error?.message || error.message || error.detail || errorText}`);
        } catch (parseError) {
          console.error(`Failed to parse error as JSON:`, parseError.message);
          console.error(`Attempted JSON parse of: "${errorText}"`);
          throw new Error(`Luma API error (${response.status}): ${errorText}`);
        }
      } else {
        console.log('=== LUMA API SUCCESS ===');
      }

      const data = await response.json();
      console.log('=== LUMA API SUCCESS ===');
      console.log(`Response data:`, JSON.stringify(data, null, 2));

      const generationId = data.id;
      if (!generationId) {
        throw new Error(`Luma response missing generation ID. Response: ${JSON.stringify(data)}`);
      }

      console.log(`Started Luma generation: ${generationId}`);

      // Poll for completion
      const videoUrl = await pollLumaGeneration(generationId, apiKey);

      console.log(`Luma generation completed: ${videoUrl}`);
      return Response.json({ videoUrl });

    } else if (providerType === 'video_runway') {
      // Start Runway Gen-2 generation
      const response = await fetch('https://api.runwayml.com/v1/gen2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt_text: prompt,
          duration: Math.min(duration, 10),
          ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '1:1'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Runway API error (${response.status}):`, errorText);
        try {
          const error = JSON.parse(errorText);
          throw new Error(`Runway API error: ${error.error?.message || error.message || errorText}`);
        } catch {
          throw new Error(`Runway API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();
      const taskId = data.id;

      console.log(`Started Runway generation: ${taskId}`);

      // Poll for completion
      const videoUrl = await pollRunwayGeneration(taskId, apiKey);

      console.log(`Runway generation completed: ${videoUrl}`);
      return Response.json({ videoUrl });

    } else if (providerType === 'video_veo') {
      // Start Google Veo generation via Gemini API
      const finalDuration = Math.max(4, Math.min(8, Math.round(Number(durationNum))));
      console.log(`[Veo Request] Final duration: ${finalDuration}, Type: ${typeof finalDuration}, IsValid: ${finalDuration >= 4 && finalDuration <= 8}`);

      const requestBody = {
        instances: [{
          prompt: prompt
        }],
        parameters: {
          aspectRatio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '16:9',
          durationSeconds: finalDuration
        }
      };
      console.log(`[Veo Request Body]`, JSON.stringify(requestBody));

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning', {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Veo API error (${response.status}):`, errorText);
        try {
          const error = JSON.parse(errorText);
          throw new Error(`Veo API error: ${error.error?.message || error.message || errorText}`);
        } catch {
          throw new Error(`Veo API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();
      const operationName = data.name;

      console.log(`Started Veo generation: ${operationName}`);

      // Poll for completion
      const videoUrl = await pollVeoGeneration(operationName, apiKey);

      console.log(`Veo generation completed: ${videoUrl}`);
      return Response.json({ videoUrl });
    }

    throw new Error('Unsupported video provider');

  } catch (error) {
    console.error('=== Generate Video Clip Error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});