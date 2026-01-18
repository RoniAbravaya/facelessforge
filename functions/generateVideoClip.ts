import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function pollLumaGeneration(generationId, apiKey, maxAttempts = 60) {
  console.log(`[Luma Polling] Starting polling for generation ${generationId}`);
  console.log(`[Luma Polling] Max attempts: ${maxAttempts}, 5 seconds per attempt = ${maxAttempts * 5}s max wait`);
  
  // Track elapsed time to prevent indefinite waits when provider doesn't respond
  const startTime = Date.now();
  const maxDurationMs = 5 * 60 * 1000; // 5 minutes max for Luma
  
  for (let i = 0; i < maxAttempts; i++) {
    // Check if we've exceeded maximum polling duration
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDurationMs) {
      const elapsedMin = Math.floor(elapsed / 60000);
      console.error(`[Luma Polling] Timeout after ${elapsedMin} minutes`);
      throw new Error(`Luma polling timed out after ${elapsedMin} minutes`);
    }
    
    console.log(`[Luma Polling] Attempt ${i + 1}/${maxAttempts} (${Math.floor(elapsed / 1000)}s elapsed) - waiting 5 seconds before poll...`);
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
  // Track elapsed time to prevent indefinite waits when provider doesn't respond
  const startTime = Date.now();
  const maxDurationMs = 5 * 60 * 1000; // 5 minutes max for Runway
  
  for (let i = 0; i < maxAttempts; i++) {
    // Check if we've exceeded maximum polling duration
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDurationMs) {
      const elapsedMin = Math.floor(elapsed / 60000);
      console.error(`[Runway Polling] Timeout after ${elapsedMin} minutes`);
      throw new Error(`Runway polling timed out after ${elapsedMin} minutes`);
    }
    
    console.log(`[Runway Polling] Attempt ${i + 1}/${maxAttempts} (${Math.floor(elapsed / 1000)}s elapsed) - waiting 5 seconds...`);
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

async function pollVeoGeneration(operationName, veoApiKey, geminiApiKey, base44, maxAttempts = 72) {
  // Track elapsed time to prevent indefinite waits when provider doesn't respond
  const startTime = Date.now();
  const maxDurationMs = 6 * 60 * 1000; // 6 minutes max for Veo
  
  for (let i = 0; i < maxAttempts; i++) {
    // Check if we've exceeded maximum polling duration
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDurationMs) {
      const elapsedMin = Math.floor(elapsed / 60000);
      console.error(`[Veo Polling] Timeout after ${elapsedMin} minutes`);
      throw new Error(`Veo polling timed out after ${elapsedMin} minutes`);
    }
    
    console.log(`[Veo Polling] Attempt ${i + 1}/${maxAttempts} (${Math.floor(elapsed / 1000)}s elapsed) - waiting 5 seconds...`);
    // Veo can take up to 6 minutes, poll every 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}`, {
      headers: {
        'x-goog-api-key': veoApiKey,
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
      
      // Check for inline data first
      const inlineData = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.inlineData?.data;
      if (inlineData) {
        console.log('[Veo] Clip generated -> extracting bytes from inline base64');
        console.log(`[Veo] Base64 data size: ${inlineData.length} chars (~${Math.round(inlineData.length * 0.75 / 1024 / 1024)} MB)`);

        const videoBytes = Uint8Array.from(atob(inlineData), c => c.charCodeAt(0));
        console.log(`[Veo] Converted to bytes: ${videoBytes.length} bytes (${(videoBytes.length / 1024 / 1024).toFixed(2)} MB)`);

        // Must use File (not Blob) for Core.UploadFile - matches generateVoiceover.js pattern
        const videoFile = new File([videoBytes], 'veo_clip.mp4', { type: 'video/mp4' });
        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: videoFile });
        console.log(`[Veo] ✓ Clip uploaded (inline) -> Base44 URL: ${uploadResult.file_url}`);
        return uploadResult.file_url;
      }
      
      // Otherwise, download from Files API using Gemini API key
      const fileUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!fileUri) {
        console.error('Veo completed but no video data:', JSON.stringify(data, null, 2));
        throw new Error('Veo generation completed but no video data found');
      }
      
      console.log(`[Veo] Clip generated -> downloading from Files API: ${fileUri}`);

      if (!geminiApiKey) {
        throw new Error('Gemini API Key required to download Veo clips. Add it in Integrations page.');
      }

      // Some fileUri values are already fully-qualified URLs (e.g. "https://generativelanguage.googleapis.com/v1beta/files/...:download?alt=media")
      // Only prefix if the URI is relative; otherwise use it as-is
      let downloadUrl = fileUri;
      if (!/^https?:\/\//.test(fileUri)) {
        downloadUrl = `https://generativelanguage.googleapis.com/v1beta/${fileUri}`;
      }

      // Append API key as a query parameter (Files API accepts it this way)
      const urlObj = new URL(downloadUrl);
      if (geminiApiKey) {
        urlObj.searchParams.set('key', geminiApiKey);
      }
      downloadUrl = urlObj.toString();

      const keySource = geminiApiKey ? 'integration' : 'missing';
      const keyPreview = geminiApiKey ? `...${geminiApiKey.slice(-4)}` : 'NONE';
      console.log(`[Veo Download] URL: ${downloadUrl}`);
      console.log(`[Veo Download] Key source: ${keySource}, preview: ${keyPreview}`);

      // Download video - retry once on 404 (file may not be immediately available)
      let downloadResponse = await fetch(downloadUrl, { method: 'GET' });

      if (!downloadResponse.ok && downloadResponse.status === 404) {
        console.warn('[Veo Download] Received 404; waiting 5 seconds before retrying...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        downloadResponse = await fetch(downloadUrl, { method: 'GET' });
      }

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        console.error(`[Veo Download] Failed (${downloadResponse.status}):`, errorText);
        console.error(`[Veo Download] Key used: source=${keySource}, preview=${keyPreview}`);

        if (downloadResponse.status === 403) {
          if (errorText.includes('SERVICE_DISABLED') || errorText.includes('disabled')) {
            throw new Error('Your Google Cloud project must have Generative Language API enabled. Go to console.cloud.google.com, enable the API, then add that project\'s key in Integrations.');
          }
          throw new Error('Gemini API access denied. Verify your API key has Generative Language API enabled and add it in Integrations.');
        }
        throw new Error(`Failed to download Veo clip (${downloadResponse.status}): ${errorText}`);
      }

      const videoBytes = new Uint8Array(await downloadResponse.arrayBuffer());
      console.log(`[Veo] Downloaded ${videoBytes.length} bytes (${(videoBytes.length / 1024 / 1024).toFixed(2)} MB)`);

      // Upload to Base44 storage - must use File (not Blob) for Core.UploadFile
      console.log('[Veo] Uploading clip to Base44 storage...');
      const videoFile = new File([videoBytes], 'veo_clip.mp4', { type: 'video/mp4' });
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: videoFile });
      console.log(`[Veo] ✓ Clip uploaded (downloaded) -> Base44 URL: ${uploadResult.file_url}`);

      return uploadResult.file_url;
    }
  }

  throw new Error('Veo generation timeout after 6 minutes');
}



Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { apiKey, providerType, prompt, duration, aspectRatio, geminiApiKey } = await req.json();

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

      // Luma API only accepts 5s, 9s, or 10s - map requested duration to supported values
      let lumaDuration;
      if (durationNum <= 5) {
        lumaDuration = 5;
      } else if (durationNum <= 9) {
        lumaDuration = 9;
      } else {
        lumaDuration = 10;
      }
      console.log(`[Luma Duration Mapping] Requested: ${durationNum}s -> Using: ${lumaDuration}s (Luma supports only 5s, 9s, 10s)`);

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
        duration: `${lumaDuration}s`,
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

      // Set timeout to prevent indefinite hangs when provider doesn't respond
      // Timeout set to 6 minutes - can be tuned based on provider performance
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6 * 60 * 1000);

      console.log('Making fetch request...');
      let response;
      try {
        response = await fetch(requestUrl, {
          method: 'POST',
          headers: lumaHeaders,
          body: requestBody,
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          throw new Error('Luma generation request timed out after 6 minutes');
        }
        throw fetchError;
      }

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
        const byteLength = new TextEncoder().encode(errorText).length;
        console.error(`Error text as bytes: ${byteLength} bytes`);
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
      // Set timeout to prevent indefinite hangs when provider doesn't respond
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6 * 60 * 1000);

      // Start Runway Gen-2 generation
      let response;
      try {
        response = await fetch('https://api.runwayml.com/v1/gen2', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt_text: prompt,
            duration: Math.min(duration, 10),
            ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '1:1'
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          throw new Error('Runway generation request timed out after 6 minutes');
        }
        throw fetchError;
      }

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
      // Veo accepts 4, 6, or 8 as integer values
      const rawDuration = Math.round(Number(durationNum));
      let finalDuration = 8; // default to 8 seconds
      if (rawDuration <= 4) {
        finalDuration = 4;
      } else if (rawDuration <= 6) {
        finalDuration = 6;
      } else {
        finalDuration = 8;
      }

      const veoKeySource = apiKey ? 'integration' : 'missing';
      const veoKeyPreview = apiKey ? `...${apiKey.slice(-4)}` : 'NONE';
      console.log(`[Veo Request] Duration: ${finalDuration}s, Key source: ${veoKeySource}, preview: ${veoKeyPreview}`);

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

      // Set timeout to prevent indefinite hangs when provider doesn't respond
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6 * 60 * 1000);

      let response;
      try {
        response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning', {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          throw new Error('Veo generation request timed out after 6 minutes');
        }
        throw fetchError;
      }

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

      // Poll for completion - returns Base44 URL after download/upload
      const videoUrl = await pollVeoGeneration(operationName, apiKey, geminiApiKey, base44);

      console.log(`Veo generation completed with Base44 URL: ${videoUrl}`);
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