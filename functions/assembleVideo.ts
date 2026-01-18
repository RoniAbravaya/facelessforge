import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Generate correlation ID for error tracking
function generateCorrelationId() {
  return `assemble_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Check FFmpeg availability
async function checkFFmpeg() {
  try {
    const command = new Deno.Command('ffmpeg', { args: ['-version'] });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

// Validate URL accessibility
async function validateUrl(url, type) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      return { valid: false, error: `HTTP ${response.status}` };
    }
    const contentLength = response.headers.get('content-length');
    if (!contentLength || parseInt(contentLength) === 0) {
      return { valid: false, error: 'Empty file' };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Download file to temp directory
async function downloadFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  await Deno.writeFile(destPath, new Uint8Array(buffer));
}

// Run FFmpeg command with error capture
async function runFFmpeg(args, correlationId) {
  console.log(`[${correlationId}][FFmpeg] Running: ffmpeg ${args.join(' ')}`);
  
  const command = new Deno.Command('ffmpeg', { 
    args,
    stdout: 'piped',
    stderr: 'piped'
  });
  
  const { code, stdout, stderr } = await command.output();
  const stderrText = new TextDecoder().decode(stderr);
  const stdoutText = new TextDecoder().decode(stdout);
  
  if (code !== 0) {
    console.error(`[${correlationId}][FFmpeg] Failed with code ${code}`);
    console.error(`[${correlationId}][FFmpeg] stderr:`, stderrText.slice(-2000));
    throw new Error(`FFmpeg failed: ${stderrText.slice(-500)}`);
  }
  
  console.log(`[${correlationId}][FFmpeg] Success`);
  return { stdout: stdoutText, stderr: stderrText };
}

// FFmpeg-based Assembly
async function assembleWithFFmpeg(clipUrls, audioUrl, scenes, aspectRatio, jobId) {
  const correlationId = generateCorrelationId();
  console.log(`[${correlationId}] Starting FFmpeg assembly`);
  
  // Check FFmpeg availability
  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    throw {
      errorCode: 'ffmpeg_not_installed',
      message: 'FFmpeg is not available in this environment',
      correlationId
    };
  }
  
  // Validate all input URLs
  console.log(`[${correlationId}] Validating ${clipUrls.length} clip URLs and audio URL`);
  for (let i = 0; i < clipUrls.length; i++) {
    const validation = await validateUrl(clipUrls[i], 'video');
    if (!validation.valid) {
      throw {
        errorCode: 'missing_artifact',
        message: `Clip ${i} is not accessible: ${validation.error}`,
        details: { url: clipUrls[i], index: i },
        correlationId
      };
    }
  }
  
  const audioValidation = await validateUrl(audioUrl, 'audio');
  if (!audioValidation.valid) {
    throw {
      errorCode: 'missing_artifact',
      message: `Audio is not accessible: ${audioValidation.error}`,
      details: { url: audioUrl },
      correlationId
    };
  }
  
  // Setup temp directory
  const tmpDir = `/tmp/${jobId}`;
  try {
    await Deno.mkdir(tmpDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
  
  // Determine dimensions based on aspect ratio
  const dimensions = aspectRatio === '9:16' 
    ? { width: 720, height: 1280 } 
    : aspectRatio === '16:9' 
    ? { width: 1280, height: 720 } 
    : { width: 720, height: 720 };
  
  // Download and normalize each clip
  console.log(`[${correlationId}] Downloading and normalizing ${clipUrls.length} clips`);
  const normalizedClips = [];
  
  for (let i = 0; i < clipUrls.length; i++) {
    const clipPath = `${tmpDir}/clip${i}.mp4`;
    const normPath = `${tmpDir}/norm${i}.mp4`;
    
    console.log(`[${correlationId}] Processing clip ${i + 1}/${clipUrls.length}`);
    
    // Download clip
    await downloadFile(clipUrls[i], clipPath);
    
    // Normalize: resize, set fps, re-encode to consistent format
    try {
      await runFFmpeg([
        '-i', clipPath,
        '-vf', `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2,fps=30`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-pix_fmt', 'yuv420p',
        '-an', // Remove audio from clips
        '-y',
        normPath
      ], correlationId);
      
      normalizedClips.push(normPath);
    } catch (error) {
      throw {
        errorCode: 'ffmpeg_normalize_failed',
        message: `Failed to normalize clip ${i}: ${error.message}`,
        details: { clipIndex: i, url: clipUrls[i] },
        correlationId
      };
    }
  }
  
  // Create concat file
  const concatListPath = `${tmpDir}/concat.txt`;
  const concatContent = normalizedClips.map(path => `file '${path.split('/').pop()}'`).join('\n');
  await Deno.writeTextFile(concatListPath, concatContent);
  console.log(`[${correlationId}] Created concat list with ${normalizedClips.length} files`);
  
  // Concatenate clips
  const concatPath = `${tmpDir}/concat.mp4`;
  try {
    await runFFmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-y',
      concatPath
    ], correlationId);
  } catch (error) {
    throw {
      errorCode: 'ffmpeg_concat_failed',
      message: `Failed to concatenate clips: ${error.message}`,
      correlationId
    };
  }
  
  // Download voiceover
  console.log(`[${correlationId}] Downloading voiceover`);
  const audioExt = audioUrl.includes('.wav') ? 'wav' : 'mp3';
  const voiceoverPath = `${tmpDir}/voiceover.${audioExt}`;
  await downloadFile(audioUrl, voiceoverPath);
  
  // Mix voiceover with video
  const finalPath = `${tmpDir}/final.mp4`;
  console.log(`[${correlationId}] Mixing audio with video`);
  try {
    await runFFmpeg([
      '-i', concatPath,
      '-i', voiceoverPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-y',
      finalPath
    ], correlationId);
  } catch (error) {
    throw {
      errorCode: 'ffmpeg_audio_mix_failed',
      message: `Failed to mix audio: ${error.message}`,
      correlationId
    };
  }
  
  // Upload final video
  console.log(`[${correlationId}] Uploading final video`);
  const base44 = createClientFromRequest({ headers: new Headers() });
  
  const finalVideoFile = await Deno.readFile(finalPath);
  const blob = new Blob([finalVideoFile], { type: 'video/mp4' });
  const formData = new FormData();
  formData.append('file', blob, 'final.mp4');
  
  const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
  const finalVideoUrl = uploadResult.file_url;
  
  // Cleanup temp files
  try {
    await Deno.remove(tmpDir, { recursive: true });
  } catch {
    // Non-critical if cleanup fails
  }
  
  console.log(`[${correlationId}] Assembly complete: ${finalVideoUrl}`);
  return { videoUrl: finalVideoUrl, correlationId };
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
    const { clipUrls, audioUrl, scenes, aspectRatio, jobId } = await req.json();

    console.log(`[${correlationId}] === VIDEO ASSEMBLY START ===`);
    console.log(`[${correlationId}] Clip URLs count: ${clipUrls?.length}`);
    console.log(`[${correlationId}] Audio URL: ${audioUrl}`);
    console.log(`[${correlationId}] Scenes count: ${scenes?.length}`);
    console.log(`[${correlationId}] Aspect Ratio: ${aspectRatio}`);
    console.log(`[${correlationId}] Job ID: ${jobId}`);

    // Validate inputs
    if (!clipUrls || clipUrls.length === 0) {
      throw {
        errorCode: 'invalid_input',
        message: 'No video clips provided for assembly',
        correlationId
      };
    }

    if (!audioUrl) {
      throw {
        errorCode: 'invalid_input',
        message: 'Audio URL is missing',
        correlationId
      };
    }

    if (!scenes || scenes.length === 0) {
      throw {
        errorCode: 'invalid_input',
        message: 'No scenes provided',
        correlationId
      };
    }

    if (!jobId) {
      throw {
        errorCode: 'invalid_input',
        message: 'Job ID is required',
        correlationId
      };
    }

    // Use FFmpeg-based assembly
    const result = await assembleWithFFmpeg(clipUrls, audioUrl, scenes, aspectRatio, jobId);

    console.log(`[${correlationId}] === VIDEO ASSEMBLY SUCCESS ===`);
    console.log(`[${correlationId}] Final video URL: ${result.videoUrl}`);

    return Response.json({ 
      ok: true,
      videoUrl: result.videoUrl,
      jobId,
      correlationId: result.correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] === VIDEO ASSEMBLY ERROR ===`);
    console.error(`[${correlationId}] Error:`, error);
    
    // Handle structured errors
    if (error.errorCode) {
      return Response.json({
        ok: false,
        step: 'video_assembly',
        errorCode: error.errorCode,
        message: error.message,
        details: error.details || {},
        correlationId: error.correlationId || correlationId
      }, { status: 500 });
    }
    
    // Handle unexpected errors
    return Response.json({ 
      ok: false,
      step: 'video_assembly',
      errorCode: 'unknown_error',
      message: error.message || 'Unknown error occurred',
      details: { stack: error.stack },
      correlationId
    }, { status: 500 });
  }
});