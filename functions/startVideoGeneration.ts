import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function logEvent(base44, jobId, step, eventType, message, progress = null, data = null) {
  await base44.asServiceRole.entities.JobEvent.create({
    job_id: jobId,
    level: eventType === 'step_failed' ? 'error' : eventType === 'step_finished' ? 'success' : 'info',
    step,
    event_type: eventType,
    message,
    progress,
    data,
    timestamp: new Date().toISOString()
  });
  
  console.log(`[Job ${jobId}][${step}][${eventType}] ${message}`);
}

async function updateJobProgress(base44, jobId, projectId, status, currentStep, progress, errorMessage = null) {
  await base44.asServiceRole.entities.Job.update(jobId, {
    status,
    current_step: currentStep,
    progress,
    ...(status === 'completed' && { finished_at: new Date().toISOString() }),
    ...(errorMessage && { error_message: errorMessage })
  });

  await base44.asServiceRole.entities.Project.update(projectId, {
    status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'generating',
    current_step: currentStep,
    progress,
    ...(errorMessage && { error_message: errorMessage })
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { projectId, jobId } = await req.json();

    const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
    const project = projects[0];

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Start generation asynchronously
    generateVideo(base44, project, jobId).catch(error => {
      console.error('Video generation failed:', error);
      // Error already logged and progress updated in generateVideo catch block
    });

    return Response.json({ success: true, message: 'Video generation started' });

  } catch (error) {
    console.error('Start generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function generateVideo(base44, project, jobId) {
  const projectId = project.id;
  let job = await base44.asServiceRole.entities.Job.filter({ id: jobId });
  job = job[0] || {};

  let currentStep = 'initialization'; // Track current step for proper error handling

  try {
    // Determine if this is a retry and what step to start from
    const steps = ['initialization', 'script_generation', 'scene_planning', 'voiceover_generation', 'video_clip_generation', 'video_assembly', 'completed'];
    let startStepIndex = 0;

    if (job.status === 'failed' || job.status === 'running') {
      const failedStepIndex = steps.indexOf(job.current_step);
      startStepIndex = failedStepIndex >= 0 ? failedStepIndex : 0;
      console.log(`Resuming from step: ${job.current_step} (index ${startStepIndex})`);
      await logEvent(base44, jobId, 'initialization', 'step_started', `Resuming video generation from step: ${job.current_step}`);
    } else {
      await updateJobProgress(base44, jobId, projectId, 'running', 'initialization', 0);
      await logEvent(base44, jobId, 'initialization', 'step_started', 'Starting video generation pipeline');
    }

    // Get integrations
    const allIntegrations = await base44.asServiceRole.entities.Integration.list();
    const getIntegration = (id) => allIntegrations.find(i => i.id === id);

    const llmIntegration = getIntegration(project.selected_providers.llm);
    const voiceIntegration = getIntegration(project.selected_providers.voice);
    const videoIntegration = getIntegration(project.selected_providers.video);
    const assemblyIntegration = getIntegration(project.selected_providers.assembly);
    const geminiIntegration = allIntegrations.find(i => i.provider_type === 'gemini_api');

    if (!llmIntegration || !voiceIntegration || !videoIntegration || !assemblyIntegration) {
      throw new Error('Missing required integrations');
    }

    // Warn if Gemini key missing for Veo
    if (videoIntegration.provider_type === 'video_veo' && !geminiIntegration) {
      console.warn('[WARNING] Veo selected but no Gemini API key configured. Clip downloads may fail.');
    }

    if (startStepIndex <= 0) {
      currentStep = 'initialization';
      await logEvent(base44, jobId, 'initialization', 'step_finished', 'All integrations loaded', 10);
    }

    // Step 1: Generate Script
    let script;
    if (startStepIndex <= 1) {
      currentStep = 'script_generation';
      await updateJobProgress(base44, jobId, projectId, 'running', currentStep, 15);
      await logEvent(base44, jobId, 'script_generation', 'step_started', 'Generating script with LLM');

      const scriptResult = await base44.asServiceRole.functions.invoke('generateScript', {
        apiKey: llmIntegration.api_key,
        topic: project.topic,
        duration: project.duration,
        language: project.language,
        style: project.style
      });

      script = scriptResult.data.script;
      await base44.asServiceRole.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'script',
        metadata: { script }
      });

      await logEvent(base44, jobId, 'script_generation', 'step_finished', 'Script generated successfully', 30, { wordCount: script.split(' ').length });
    } else {
      const scriptArtifacts = await base44.asServiceRole.entities.Artifact.filter({ job_id: jobId, artifact_type: 'script' });
      script = scriptArtifacts[0]?.metadata?.script;
      console.log('Skipping script generation - already completed');
    }

    // Step 2: Generate Scene Plan
    let scenes;
    if (startStepIndex <= 2) {
      currentStep = 'scene_planning';
      await updateJobProgress(base44, jobId, projectId, 'running', currentStep, 35);
      await logEvent(base44, jobId, 'scene_planning', 'step_started', 'Creating scene breakdown');

      const scenePlanResult = await base44.asServiceRole.functions.invoke('generateScenePlan', {
        apiKey: llmIntegration.api_key,
        script,
        duration: project.duration,
        style: project.style
      });

      scenes = scenePlanResult.data.scenes;

      // Scale scene durations to match project duration exactly
      const targetDuration = project.duration;
      const sceneCount = scenes.length;
      const minTotalDuration = sceneCount * 4; // Minimum 4s per scene
      const maxTotalDuration = sceneCount * 8; // Maximum 8s per scene

      if (targetDuration < minTotalDuration) {
        throw new Error(`Target duration ${targetDuration}s is too short for ${sceneCount} scenes. Minimum required: ${minTotalDuration}s (4s per scene). Please increase duration or reduce scene count.`);
      }

      if (targetDuration > maxTotalDuration) {
        await logEvent(base44, jobId, 'scene_planning', 'step_progress', `Target duration ${targetDuration}s exceeds max ${maxTotalDuration}s for ${sceneCount} scenes. Capping at maximum.`, 40, { warning: true });
        console.warn(`[Scene Scaling] Target ${targetDuration}s > max ${maxTotalDuration}s, will cap at max`);
      }

      // Calculate current total and scaling factor
      const currentTotal = scenes.reduce((sum, s) => sum + s.duration, 0);
      const scalingFactor = targetDuration / currentTotal;

      console.log(`[Scene Scaling] Current total: ${currentTotal}s, Target: ${targetDuration}s, Factor: ${scalingFactor.toFixed(3)}`);
      await logEvent(base44, jobId, 'scene_planning', 'step_progress', `Scaling ${sceneCount} scenes to match ${targetDuration}s duration`, 38);

      // Apply scaling and clamping
      let scaledScenes = scenes.map((s, idx) => {
        const scaled = s.duration * scalingFactor;
        const clamped = Math.max(4, Math.min(8, scaled));
        console.log(`[Scene ${idx + 1}] Original: ${s.duration.toFixed(2)}s -> Scaled: ${scaled.toFixed(2)}s -> Clamped: ${clamped.toFixed(2)}s`);
        return { ...s, duration: clamped };
      });

      // Calculate actual total after clamping
      let actualTotal = scaledScenes.reduce((sum, s) => sum + s.duration, 0);
      const difference = targetDuration - actualTotal;

      console.log(`[Scene Scaling] After clamping: ${actualTotal.toFixed(2)}s, Difference: ${difference.toFixed(2)}s`);

      // Distribute the difference across scenes that have room
      if (Math.abs(difference) > 0.1) {
        await logEvent(base44, jobId, 'scene_planning', 'step_progress', `Adjusting scene durations to match exactly ${targetDuration}s`, 40);

        const adjustment = difference / sceneCount;
        scaledScenes = scaledScenes.map((s, idx) => {
          let newDuration = s.duration + adjustment;
          // Re-clamp to 4-8 range
          newDuration = Math.max(4, Math.min(8, newDuration));
          console.log(`[Scene ${idx + 1}] Adjusted: ${s.duration.toFixed(2)}s -> ${newDuration.toFixed(2)}s`);
          return { ...s, duration: newDuration };
        });

        actualTotal = scaledScenes.reduce((sum, s) => sum + s.duration, 0);
        console.log(`[Scene Scaling] Final total: ${actualTotal.toFixed(2)}s (target: ${targetDuration}s)`);
      }

      // Final rounding to match target exactly
      const finalDifference = targetDuration - actualTotal;
      if (Math.abs(finalDifference) > 0.01) {
        // Add/subtract the remaining difference to the longest scene (which has most room)
        const longestIdx = scaledScenes.reduce((maxIdx, s, idx, arr) => 
          s.duration > arr[maxIdx].duration ? idx : maxIdx, 0);

        scaledScenes[longestIdx].duration += finalDifference;
        scaledScenes[longestIdx].duration = Math.max(4, Math.min(8, scaledScenes[longestIdx].duration));
        console.log(`[Scene Scaling] Applied final adjustment of ${finalDifference.toFixed(3)}s to scene ${longestIdx + 1}`);
      }

      scenes = scaledScenes;
      const finalTotal = scenes.reduce((sum, s) => sum + s.duration, 0);
      console.log(`[Scene Scaling] ✓ Complete. Final total: ${finalTotal.toFixed(2)}s (target: ${targetDuration}s)`);

      await base44.asServiceRole.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'scene_plan',
        metadata: { scenes, scalingApplied: true, targetDuration, actualTotal: finalTotal }
      });

      await logEvent(base44, jobId, 'scene_planning', 'step_finished', `Scene plan created with ${scenes.length} scenes (total: ${finalTotal.toFixed(1)}s)`, 45, { sceneCount: scenes.length, totalDuration: finalTotal });
    } else {
      const sceneArtifacts = await base44.asServiceRole.entities.Artifact.filter({ job_id: jobId, artifact_type: 'scene_plan' });
      scenes = sceneArtifacts[0]?.metadata?.scenes;
      console.log('Skipping scene planning - already completed');
    }

    // Step 3: Generate Voiceover
    let voiceResult;
    if (startStepIndex <= 3) {
      currentStep = 'voiceover_generation';
      await updateJobProgress(base44, jobId, projectId, 'running', currentStep, 50);
      await logEvent(base44, jobId, 'voiceover_generation', 'step_started', 'Generating voiceover');

      voiceResult = await base44.asServiceRole.functions.invoke('generateVoiceover', {
        apiKey: voiceIntegration.api_key,
        providerType: voiceIntegration.provider_type,
        text: script,
        language: project.language
      });

      await base44.asServiceRole.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'voiceover',
        file_url: voiceResult.data.audioUrl
      });

      await logEvent(base44, jobId, 'voiceover_generation', 'step_finished', 'Voiceover generated', 60);
    } else {
      const voiceArtifacts = await base44.asServiceRole.entities.Artifact.filter({ job_id: jobId, artifact_type: 'voiceover' });
      voiceResult = { data: { audioUrl: voiceArtifacts[0]?.file_url } };
      console.log('Skipping voiceover generation - already completed');
    }

    // Step 4: Generate Video Clips
    let clipUrls = [];
    if (startStepIndex <= 4) {
      currentStep = 'video_clip_generation';
      // Get already generated clips
      const existingClips = await base44.asServiceRole.entities.Artifact.filter({ job_id: jobId, artifact_type: 'video_clip' });
      const generatedScenes = new Set(existingClips.map(c => c.scene_index));

      await updateJobProgress(base44, jobId, projectId, 'running', currentStep, 65);

      console.log(`[Clip Generation] Total scenes: ${scenes.length}, Already generated: ${generatedScenes.size}`);
      console.log(`[Clip Generation] Scenes array:`, JSON.stringify(scenes.map((s, idx) => ({ idx, duration: s.duration, prompt: s.prompt?.substring(0, 50) }))));

      // Only log step_started if this is a fresh start, not a resume
      if (generatedScenes.size === 0) {
        await logEvent(base44, jobId, 'video_clip_generation', 'step_started', `Generating ${scenes.length} video clips`);
      }

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const progressPercent = 65 + Math.floor((i / scenes.length) * 15);

        if (generatedScenes.has(i)) {
          const clip = existingClips.find(c => c.scene_index === i);
          clipUrls.push(clip.file_url);
          console.log(`Skipping clip ${i + 1}/${scenes.length} - already generated`);
          await logEvent(base44, jobId, 'video_clip_generation', 'step_progress', `Skipped clip ${i + 1}/${scenes.length}`, progressPercent);
          continue;
        }

        console.log(`[Clip Generation] Starting clip ${i + 1}/${scenes.length}`);
        await logEvent(base44, jobId, 'video_clip_generation', 'step_progress', `Generating clip ${i + 1}/${scenes.length}`, progressPercent);

        try {
          // Clamp duration to 4-8 seconds (required by video generation APIs)
          const rawDuration = scene.duration;
          const clampedDuration = Math.max(4, Math.min(8, Math.round(rawDuration)));
          console.log(`[Clip ${i + 1}/${scenes.length}] Raw duration: ${rawDuration}, Type: ${typeof rawDuration}, Clamped: ${clampedDuration}, IsNumber: ${!isNaN(rawDuration)}`);
          console.log(`[Clip ${i + 1}] Scene object:`, JSON.stringify({ duration: scene.duration, prompt: scene.prompt?.substring(0, 50) }));

          const clipResult = await base44.asServiceRole.functions.invoke('generateVideoClip', {
            apiKey: videoIntegration.api_key,
            providerType: videoIntegration.provider_type,
            prompt: scene.prompt,
            duration: clampedDuration,
            aspectRatio: project.aspect_ratio,
            geminiApiKey: geminiIntegration?.api_key
          });

          if (!clipResult.data.videoUrl) {
            throw new Error(`No video URL returned for clip ${i + 1}`);
          }

          clipUrls.push(clipResult.data.videoUrl);

          await base44.asServiceRole.entities.Artifact.create({
            job_id: jobId,
            project_id: projectId,
            artifact_type: 'video_clip',
            file_url: clipResult.data.videoUrl,
            scene_index: i,
            duration: scene.duration,
            metadata: { prompt: scene.prompt }
          });
        } catch (clipError) {
          console.error(`Failed to generate clip ${i + 1}:`, clipError);
          throw new Error(`Video clip ${i + 1} generation failed: ${clipError.response?.data?.error || clipError.message}`);
        }
      }

      await logEvent(base44, jobId, 'video_clip_generation', 'step_finished', 'All video clips generated', 80);
    } else {
      const existingClips = await base44.asServiceRole.entities.Artifact.filter({ job_id: jobId, artifact_type: 'video_clip' });
      clipUrls = existingClips.sort((a, b) => a.scene_index - b.scene_index).map(c => c.file_url);
      console.log('Skipping video clip generation - already completed');
    }

    // Step 5: Assemble Final Video (Client-Side)
    if (startStepIndex <= 5) {
      currentStep = 'video_assembly';
      await updateJobProgress(base44, jobId, projectId, 'running', currentStep, 85);
      await logEvent(base44, jobId, 'video_assembly', 'step_started', 'Preparing for client-side assembly');

      try {
        const assemblyResult = await base44.asServiceRole.functions.invoke('assembleVideo', {
          clipUrls,
          audioUrl: voiceResult.data.audioUrl,
          scenes,
          aspectRatio: project.aspect_ratio,
          jobId
        });

        // Check if client-side assembly is required
        if (assemblyResult.data.mode === 'client_ffmpeg_wasm') {
          console.log('[Assembly] Client-side assembly required - waiting for browser to complete');
          await logEvent(base44, jobId, 'video_assembly', 'step_progress', 
            'Client-side assembly required - browser will complete assembly', 
            85,
            { 
              mode: 'client_ffmpeg_wasm',
              clipUrls: clipUrls,
              voiceoverUrl: voiceResult.data.audioUrl,
              aspectRatio: project.aspect_ratio,
              jobId: jobId,
              projectId: projectId,
              clipCount: clipUrls.length,
              correlationId: assemblyResult.data.correlationId
            }
          );
          // Job will be completed by the client after assembly
          return;
        }

        // Server-side assembly completed
        if (assemblyResult.data.ok === false) {
          const errorMsg = `${assemblyResult.data.errorCode}: ${assemblyResult.data.message}`;
          console.error(`[Assembly Error] ${errorMsg}`, assemblyResult.data.details);
          throw new Error(errorMsg);
        }

        await base44.asServiceRole.entities.Artifact.create({
          job_id: jobId,
          project_id: projectId,
          artifact_type: 'final_video',
          file_url: assemblyResult.data.videoUrl,
          duration: project.duration
        });

        await logEvent(base44, jobId, 'video_assembly', 'step_finished', 'Final video assembled', 95);
      } catch (assemblyError) {
        const errorDetails = assemblyError.response?.data || { message: assemblyError.message };
        console.error('[Video Assembly Failed]', errorDetails);
        await logEvent(base44, jobId, 'video_assembly', 'step_failed', 
          errorDetails.message || assemblyError.message, 
          null, 
          { 
            errorCode: errorDetails.errorCode,
            correlationId: errorDetails.correlationId,
            details: errorDetails.details 
          }
        );
        throw assemblyError;
      }
    } else {
      console.log('Skipping video assembly - already completed');
    }

    // Complete
    await updateJobProgress(base44, jobId, projectId, 'completed', 'completed', 100);
    await logEvent(base44, jobId, 'completion', 'step_finished', 'Video generation completed successfully!', 100);

  } catch (error) {
    console.error('Generation error:', error);
    await updateJobProgress(base44, jobId, projectId, 'failed', currentStep, 0, error.message);
    await logEvent(base44, jobId, currentStep, 'step_failed', error.message, null, { error: error.stack });
    throw error;
  }
}