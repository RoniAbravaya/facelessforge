import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Generate correlation ID for error tracking
function generateCorrelationId() {
  return `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Creatomate Assembly
async function assembleCreatomate(apiKey, clipUrls, audioUrl, scenes, aspectRatio) {
  const width = aspectRatio === '9:16' ? 1080 : aspectRatio === '16:9' ? 1920 : 1080;
  const height = aspectRatio === '9:16' ? 1920 : aspectRatio === '16:9' ? 1080 : 1080;

  const elements = [
    {
      type: 'audio',
      source: audioUrl,
      track: 1
    },
    ...clipUrls.map((url, idx) => {
      const startTime = scenes.slice(0, idx).reduce((sum, s) => sum + s.duration, 0);
      const duration = scenes[idx].duration;

      return {
        type: 'video',
        source: url,
        track: 2 + idx,
        time: startTime,
        duration: duration,
        fit: 'cover'
      };
    })
  ];

  const response = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      template_id: null,
      modifications: {
        width,
        height,
        elements
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Creatomate error: ${error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const renderId = data[0]?.id;

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResponse = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const statusData = await statusResponse.json();

    if (statusData.status === 'succeeded') {
      return statusData.url;
    } else if (statusData.status === 'failed') {
      throw new Error('Creatomate render failed');
    }
  }

  throw new Error('Creatomate render timeout');
}

// Bannerbear Assembly
async function assembleBannerbear(apiKey, clipUrls, audioUrl, scenes) {
  const response = await fetch('https://api.bannerbear.com/v2/videos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input_media_url: clipUrls[0], // Use first clip as base
      audio_url: audioUrl,
      transitions: scenes.map((s, idx) => ({
        time: scenes.slice(0, idx).reduce((sum, sc) => sum + sc.duration, 0),
        video_url: clipUrls[idx]
      }))
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Bannerbear error: ${error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.video_url || data.url;
}

// JSON2Video Assembly
async function assembleJson2Video(apiKey, clipUrls, audioUrl, scenes, aspectRatio) {
  const resolution = aspectRatio === '9:16' ? 'portrait' : aspectRatio === '16:9' ? 'landscape' : 'square';

  const response = await fetch('https://api.json2video.com/v2/movies', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      resolution,
      soundtrack: audioUrl,
      scenes: clipUrls.map((url, idx) => ({
        duration: scenes[idx].duration,
        elements: [
          {
            type: 'video',
            src: url,
            settings: { fit: 'cover' }
          }
        ]
      }))
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`JSON2Video error: ${error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const projectId = data.project;

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResponse = await fetch(`https://api.json2video.com/v2/movies/${projectId}`, {
      headers: { 'x-api-key': apiKey }
    });

    const statusData = await statusResponse.json();

    if (statusData.status === 'done') {
      return statusData.url;
    } else if (statusData.status === 'error') {
      throw new Error('JSON2Video render failed');
    }
  }

  throw new Error('JSON2Video render timeout');
}

// Plainly Assembly
async function assemblePlainly(apiKey, clipUrls, audioUrl, scenes) {
  const response = await fetch('https://api.plainlyvideos.com/api/v1/render', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parameters: {
        clips: clipUrls,
        audio: audioUrl,
        scenes: scenes.map(s => ({ duration: s.duration }))
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Plainly error: ${error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.videoUrl || data.url;
}

Deno.serve(async (req) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { clipUrls, audioUrl, aspectRatio, jobId } = await req.json();

    console.log(`[${correlationId}] === VIDEO ASSEMBLY PROXY START ===`);
    console.log(`[${correlationId}] Clip URLs count: ${clipUrls?.length}`);
    console.log(`[${correlationId}] Aspect Ratio: ${aspectRatio}`);
    console.log(`[${correlationId}] Job ID: ${jobId}`);

    // Validate inputs
    if (!clipUrls || clipUrls.length === 0) {
      return Response.json({
        ok: false,
        errorCode: 'invalid_input',
        message: 'No video clips provided for assembly',
        correlationId
      }, { status: 400 });
    }

    if (!audioUrl) {
      return Response.json({
        ok: false,
        errorCode: 'invalid_input',
        message: 'Audio URL is missing',
        correlationId
      }, { status: 400 });
    }

    if (!jobId) {
      return Response.json({
        ok: false,
        errorCode: 'invalid_input',
        message: 'Job ID is required',
        correlationId
      }, { status: 400 });
    }

    // Get assembly worker URL from environment
    const ASSEMBLY_WORKER_URL = Deno.env.get('ASSEMBLY_WORKER_URL');
    
    if (!ASSEMBLY_WORKER_URL) {
      return Response.json({
        ok: false,
        errorCode: 'worker_not_configured',
        message: 'ASSEMBLY_WORKER_URL environment variable is not set',
        correlationId
      }, { status: 500 });
    }

    console.log(`[${correlationId}] Forwarding to worker: ${ASSEMBLY_WORKER_URL}`);

    // Call assembly worker with 5-minute timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

    try {
      const response = await fetch(`${ASSEMBLY_WORKER_URL}/assemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          clipUrls,
          voiceoverUrl: audioUrl,
          aspectRatio,
          outputFps: 30,
          resolution: '720p'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok) {
        console.error(`[${correlationId}] Worker error:`, result);
        return Response.json({
          ok: false,
          step: 'video_assembly',
          errorCode: result.errorCode || 'worker_error',
          message: result.message || 'Assembly worker returned error',
          details: result.details || {},
          correlationId: result.correlationId || correlationId
        }, { status: response.status });
      }

      console.log(`[${correlationId}] === VIDEO ASSEMBLY SUCCESS ===`);
      console.log(`[${correlationId}] Final video URL: ${result.finalVideoUrl}`);

      return Response.json({
        ok: true,
        videoUrl: result.finalVideoUrl,
        jobId: result.jobId,
        correlationId: result.correlationId
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return Response.json({
          ok: false,
          errorCode: 'worker_timeout',
          message: 'Assembly worker request timed out after 5 minutes',
          correlationId
        }, { status: 504 });
      }

      throw fetchError;
    }

  } catch (error) {
    console.error(`[${correlationId}] === VIDEO ASSEMBLY ERROR ===`);
    console.error(`[${correlationId}] Error:`, error);
    
    return Response.json({ 
      ok: false,
      step: 'video_assembly',
      errorCode: 'proxy_error',
      message: error.message || 'Failed to communicate with assembly worker',
      details: { stack: error.stack },
      correlationId
    }, { status: 500 });
  }
});