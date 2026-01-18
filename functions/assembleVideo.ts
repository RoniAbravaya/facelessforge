import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Shotstack Assembly
async function assembleShotstack(apiKey, clipUrls, audioUrl, scenes, aspectRatio, title) {
  // Build size object based on aspect ratio
  const size = aspectRatio === '9:16' 
    ? { width: 1080, height: 1920 } 
    : aspectRatio === '16:9' 
    ? { width: 1920, height: 1080 } 
    : { width: 1080, height: 1080 };

  const timeline = {
    soundtrack: {
      src: audioUrl,
      effect: 'fadeInFadeOut'
    },
    tracks: [
      {
        clips: clipUrls.map((url, idx) => {
          const scene = scenes[idx];
          const startTime = scenes.slice(0, idx).reduce((sum, s) => sum + s.duration, 0);
          
          return {
            asset: {
              type: 'video',
              src: url
            },
            start: startTime,
            length: scene.duration
          };
        })
      }
    ]
  };

  const output = {
    format: 'mp4',
    size: size
  };

  // Detect if using sandbox key (starts with lowercase letter) vs production (starts with uppercase)
  const isSandbox = apiKey && apiKey[0] === apiKey[0].toLowerCase();
  const baseUrl = isSandbox ? 'https://api.shotstack.io/stage' : 'https://api.shotstack.io/v1';
  
  console.log(`[Shotstack] Using ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} environment`);
  console.log('[Shotstack] Request body:', JSON.stringify({ timeline, output }, null, 2));

  // Submit render
  const renderResponse = await fetch(`${baseUrl}/render`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ timeline, output })
  });

  console.log(`[Shotstack] Response status: ${renderResponse.status}`);

  if (!renderResponse.ok) {
    const errorText = await renderResponse.text();
    console.error('[Shotstack] Error response:', errorText);
    try {
      const error = JSON.parse(errorText);
      throw new Error(`Shotstack error (${renderResponse.status}): ${error.message || JSON.stringify(error)}`);
    } catch (parseError) {
      throw new Error(`Shotstack error (${renderResponse.status}): ${errorText}`);
    }
  }

  const renderData = await renderResponse.json();
  console.log(`[Shotstack] Full response data:`, JSON.stringify(renderData, null, 2));
  
  const renderId = renderData.response?.id;
  if (!renderId) {
    throw new Error('Shotstack response missing render ID');
  }

  console.log(`[Shotstack] Render started: ${renderId}`);

  // Poll for completion
  for (let i = 0; i < 120; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResponse = await fetch(`${baseUrl}/render/${renderId}`, {
      headers: { 'x-api-key': apiKey }
    });

    const statusData = await statusResponse.json();
    const status = statusData.response.status;

    if (status === 'done') {
      return statusData.response.url;
    } else if (status === 'failed') {
      throw new Error('Shotstack render failed');
    }
  }

  throw new Error('Shotstack render timeout');
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
  try {
    const { apiKey, providerType, clipUrls, audioUrl, scenes, aspectRatio, title } = await req.json();

    console.log('=== VIDEO ASSEMBLY START ===');
    console.log(`Provider: ${providerType}`);
    console.log(`API Key length: ${apiKey?.length}`);
    console.log(`Clip URLs count: ${clipUrls?.length}`);
    console.log(`Audio URL: ${audioUrl}`);
    console.log(`Scenes count: ${scenes?.length}`);
    console.log(`Aspect Ratio: ${aspectRatio}`);
    console.log(`Clip URLs:`, clipUrls);
    console.log(`Scenes:`, JSON.stringify(scenes, null, 2));

    if (!apiKey) {
      throw new Error(`API key is missing for provider: ${providerType}`);
    }

    if (!clipUrls || clipUrls.length === 0) {
      throw new Error('No video clips provided for assembly');
    }

    if (!audioUrl) {
      throw new Error('Audio URL is missing');
    }

    if (!scenes || scenes.length === 0) {
      throw new Error('No scenes provided');
    }

    let videoUrl;

    switch (providerType) {
      case 'assembly_shotstack':
        console.log('[Shotstack] Starting assembly...');
        videoUrl = await assembleShotstack(apiKey, clipUrls, audioUrl, scenes, aspectRatio, title);
        break;
      
      case 'assembly_creatomate':
        console.log('[Creatomate] Starting assembly...');
        videoUrl = await assembleCreatomate(apiKey, clipUrls, audioUrl, scenes, aspectRatio);
        break;
      
      case 'assembly_bannerbear':
        console.log('[Bannerbear] Starting assembly...');
        videoUrl = await assembleBannerbear(apiKey, clipUrls, audioUrl, scenes);
        break;
      
      case 'assembly_json2video':
        console.log('[JSON2Video] Starting assembly...');
        videoUrl = await assembleJson2Video(apiKey, clipUrls, audioUrl, scenes, aspectRatio);
        break;
      
      case 'assembly_plainly':
        console.log('[Plainly] Starting assembly...');
        videoUrl = await assemblePlainly(apiKey, clipUrls, audioUrl, scenes);
        break;
      
      default:
        throw new Error(`Unsupported assembly provider: ${providerType}`);
    }

    console.log('=== VIDEO ASSEMBLY SUCCESS ===');
    console.log(`Final video URL: ${videoUrl}`);

    return Response.json({ videoUrl });

  } catch (error) {
    console.error('=== VIDEO ASSEMBLY ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error response data:', error.response?.data);
    console.error('Provider:', providerType);
    console.error('Clip count:', clipUrls?.length);
    
    return Response.json({ 
      error: error.message,
      details: error.response?.data || error.stack,
      provider: providerType,
      clipCount: clipUrls?.length
    }, { status: 500 });
  }
});