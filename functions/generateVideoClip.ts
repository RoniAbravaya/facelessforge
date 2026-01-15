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

// Removed Veo polling function as the API is not publicly available yet

Deno.serve(async (req) => {
  try {
    const { apiKey, providerType, prompt, duration, aspectRatio } = await req.json();

    console.log('=== Generate Video Clip Request ===');
    console.log(`Provider: ${providerType}`);
    console.log(`Prompt: ${prompt?.substring(0, 150)}...`);
    console.log(`Duration: ${duration}s, Aspect Ratio: ${aspectRatio}`);
    
    if (!apiKey) {
      throw new Error(`API key is missing for provider: ${providerType}`);
    }
    
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Video prompt is empty');
    }

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
      // Google Veo is not yet publicly available via API
      // This is a placeholder for when the API becomes available
      throw new Error('Google Veo API is not yet publicly available. Please use Luma AI or Runway ML instead.');
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