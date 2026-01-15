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
      logEvent(base44, jobId, 'error', 'step_failed', error.message, null, { error: error.stack });
      updateJobProgress(base44, jobId, projectId, 'failed', 'error', 0, error.message);
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

    if (!llmIntegration || !voiceIntegration || !videoIntegration || !assemblyIntegration) {
      throw new Error('Missing required integrations');
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
      await base44.asServiceRole.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'scene_plan',
        metadata: { scenes }
      });

      await logEvent(base44, jobId, 'scene_planning', 'step_finished', `Scene plan created with ${scenes.length} scenes`, 45, { sceneCount: scenes.length });
    } else {
      const sceneArtifacts = await base44.asServiceRole.entities.Artifact.filter({ job_id: jobId, artifact_type: 'scene_plan' });
      scenes = sceneArtifacts[0]?.metadata?.scenes;
      console.log('Skipping scene planning - already completed');
    }

    // Step 3: Generate Voiceover
    let voiceResult;
    if (startStepIndex <= 3) {
      await updateJobProgress(base44, jobId, projectId, 'running', 'voiceover_generation', 50);
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
      // Get already generated clips
      const existingClips = await base44.asServiceRole.entities.Artifact.filter({ job_id: jobId, artifact_type: 'video_clip' });
      const generatedScenes = new Set(existingClips.map(c => c.scene_index));

      await updateJobProgress(base44, jobId, projectId, 'running', 'video_clip_generation', 65);
      await logEvent(base44, jobId, 'video_clip_generation', 'step_started', `Generating ${scenes.length} video clips`);

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];

        if (generatedScenes.has(i)) {
          const clip = existingClips.find(c => c.scene_index === i);
          clipUrls.push(clip.file_url);
          console.log(`Skipping clip ${i + 1} - already generated`);
          continue;
        }

        await logEvent(base44, jobId, 'video_clip_generation', 'step_progress', `Generating clip ${i + 1}/${scenes.length}`, 65 + (i / scenes.length) * 15);

        try {
          const clipResult = await base44.asServiceRole.functions.invoke('generateVideoClip', {
            apiKey: videoIntegration.api_key,
            providerType: videoIntegration.provider_type,
            prompt: scene.prompt,
            duration: scene.duration,
            aspectRatio: project.aspect_ratio
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

    // Step 5: Assemble Final Video
    if (startStepIndex <= 5) {
      await updateJobProgress(base44, jobId, projectId, 'running', 'video_assembly', 85);
      await logEvent(base44, jobId, 'video_assembly', 'step_started', 'Assembling final video');

      const assemblyResult = await base44.asServiceRole.functions.invoke('assembleVideo', {
        apiKey: assemblyIntegration.api_key,
        providerType: assemblyIntegration.provider_type,
        clipUrls,
        audioUrl: voiceResult.data.audioUrl,
        scenes,
        aspectRatio: project.aspect_ratio,
        title: project.title
      });

      await base44.asServiceRole.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'final_video',
        file_url: assemblyResult.data.videoUrl,
        duration: project.duration
      });

      await logEvent(base44, jobId, 'video_assembly', 'step_finished', 'Final video assembled', 95);
    } else {
      console.log('Skipping video assembly - already completed');
    }

    // Complete
    await updateJobProgress(base44, jobId, projectId, 'completed', 'completed', 100);
    await logEvent(base44, jobId, 'completion', 'step_finished', 'Video generation completed successfully!', 100);

  } catch (error) {
    console.error('Generation error:', error);
    await updateJobProgress(base44, jobId, projectId, 'failed', job.current_step || 'error', 0, error.message);
    await logEvent(base44, jobId, 'error', 'step_failed', error.message, null, { error: error.stack });
    throw error;
  }
}