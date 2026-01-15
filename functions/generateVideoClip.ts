import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function pollLumaGeneration(generationId, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    const response = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${generationId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Luma polling error (${response.status}):`, errorText);
      throw new Error(`Failed to poll Luma generation: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Luma status (attempt ${i + 1}/${maxAttempts}):`, data.state);
    
    if (data.state === 'completed') {
      const videoUrl = data.assets?.video || data.video_url;
      if (!videoUrl) {
        console.error('Luma completed but no video URL:', data);
        throw new Error('Luma generation completed but no video URL found');
      }
      return videoUrl;
    } else if (data.state === 'failed') {
      const errorMsg = data.failure_reason || 'Unknown error';
      console.error('Luma generation failed:', errorMsg);
      throw new Error(`Luma video generation failed: ${errorMsg}`);
    }
    
    // Still processing, continue polling
  }

  throw new Error('Luma generation timeout after 5 minutes');
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
      // Start Luma generation
      const lumaHeaders = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      const lumaBody = {
        model: 'ray-2',
        prompt,
        duration: `${durationNum}s`,
        aspect_ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '1:1',
        loop: false
      };

      console.log(`[Luma Request] Headers:`, JSON.stringify({ Authorization: '***REDACTED***', 'Content-Type': 'application/json' }));
      console.log(`[Luma Request] Body:`, JSON.stringify(lumaBody));
      console.log(`[Luma Request] API Key length: ${apiKey?.length}, First 10 chars: ${apiKey?.substring(0, 10)}...`);

      const response = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
        method: 'POST',
        headers: lumaHeaders,
        body: JSON.stringify(lumaBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Luma API Error] Status: ${response.status}`);
        console.error(`[Luma API Error] Response:`, errorText);
        console.error(`[Luma API Error] Headers sent:`, JSON.stringify(lumaHeaders));
        try {
          const error = JSON.parse(errorText);
          throw new Error(`Luma API error: ${error.error?.message || error.message || error.detail || errorText}`);
        } catch {
          throw new Error(`Luma API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();
      const generationId = data.id;

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
      const finalDuration = parseInt(durationNum, 10);
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