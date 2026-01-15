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
      throw new Error('Failed to poll Luma generation status');
    }

    const data = await response.json();
    
    if (data.state === 'completed') {
      return data.assets?.video || data.video_url;
    } else if (data.state === 'failed') {
      throw new Error('Luma video generation failed');
    }
    
    // Still processing, continue polling
  }

  throw new Error('Luma generation timeout');
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
      throw new Error('Failed to poll Runway generation status');
    }

    const data = await response.json();
    
    if (data.status === 'SUCCEEDED') {
      return data.output?.[0] || data.artifacts?.[0]?.url;
    } else if (data.status === 'FAILED') {
      throw new Error('Runway video generation failed');
    }
  }

  throw new Error('Runway generation timeout');
}

async function pollVeoGeneration(operationName, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const response = await fetch(`https://aiplatform.googleapis.com/v1/${operationName}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to poll Veo generation status');
    }

    const data = await response.json();
    
    if (data.done) {
      if (data.error) {
        throw new Error(`Veo generation failed: ${data.error.message}`);
      }
      return data.response?.generatedSamples?.[0]?.video?.uri || data.response?.videoUri;
    }
  }

  throw new Error('Veo generation timeout');
}

Deno.serve(async (req) => {
  try {
    const { apiKey, providerType, prompt, duration, aspectRatio } = await req.json();

    console.log(`Generating video clip with ${providerType}`);
    console.log(`Prompt: ${prompt}`);
    console.log(`Duration: ${duration}, Aspect Ratio: ${aspectRatio}`);

    if (providerType === 'video_luma') {
      // Start Luma generation
      const response = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          aspect_ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '16:9' ? '16:9' : '1:1',
          loop: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Luma API error (${response.status}):`, errorText);
        try {
          const error = JSON.parse(errorText);
          throw new Error(`Luma API error: ${error.error?.message || error.message || errorText}`);
        } catch {
          throw new Error(`Luma API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();
      const generationId = data.id;

      console.log(`Started Luma generation: ${generationId}`);

      // Poll for completion
      const videoUrl = await pollLumaGeneration(generationId, apiKey);

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

      return Response.json({ videoUrl });

    } else if (providerType === 'video_veo') {
      // Start Google Veo generation
      const response = await fetch('https://aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models/veo-001:generateVideo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          videoConfig: {
            duration: `${Math.min(duration, 8)}s`,
            aspectRatio: aspectRatio === '9:16' ? 'PORTRAIT' : aspectRatio === '16:9' ? 'LANDSCAPE' : 'SQUARE'
          }
        })
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

      return Response.json({ videoUrl });
    }

    throw new Error('Unsupported video provider');

  } catch (error) {
    console.error('Generate video clip error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});