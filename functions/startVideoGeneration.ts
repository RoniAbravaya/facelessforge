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

  try {
    await updateJobProgress(base44, jobId, projectId, 'running', 'initialization', 0);
    await logEvent(base44, jobId, 'initialization', 'step_started', 'Starting video generation pipeline');

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

    await logEvent(base44, jobId, 'initialization', 'step_finished', 'All integrations loaded', 10);

    // Step 1: Generate Script
    await updateJobProgress(base44, jobId, projectId, 'running', 'script_generation', 15);
    await logEvent(base44, jobId, 'script_generation', 'step_started', 'Generating script with LLM');

    const scriptResult = await base44.asServiceRole.functions.invoke('generateScript', {
      apiKey: llmIntegration.api_key,
      topic: project.topic,
      duration: project.duration,
      language: project.language,
      style: project.style
    });

    const script = scriptResult.data.script;
    await base44.asServiceRole.entities.Artifact.create({
      job_id: jobId,
      project_id: projectId,
      artifact_type: 'script',
      metadata: { script }
    });

    await logEvent(base44, jobId, 'script_generation', 'step_finished', 'Script generated successfully', 30, { wordCount: script.split(' ').length });

    // Step 2: Generate Scene Plan
    await updateJobProgress(base44, jobId, projectId, 'running', 'scene_planning', 35);
    await logEvent(base44, jobId, 'scene_planning', 'step_started', 'Creating scene breakdown');

    const scenePlanResult = await base44.asServiceRole.functions.invoke('generateScenePlan', {
      apiKey: llmIntegration.api_key,
      script,
      duration: project.duration,
      style: project.style
    });

    const scenes = scenePlanResult.data.scenes;
    await base44.asServiceRole.entities.Artifact.create({
      job_id: jobId,
      project_id: projectId,
      artifact_type: 'scene_plan',
      metadata: { scenes }
    });

    await logEvent(base44, jobId, 'scene_planning', 'step_finished', `Scene plan created with ${scenes.length} scenes`, 45, { sceneCount: scenes.length });

    // Step 3: Generate Voiceover
    await updateJobProgress(base44, jobId, projectId, 'running', 'voiceover_generation', 50);
    await logEvent(base44, jobId, 'voiceover_generation', 'step_started', 'Generating voiceover');

    const voiceResult = await base44.asServiceRole.functions.invoke('generateVoiceover', {
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

    // Step 4: Generate Video Clips
    await updateJobProgress(base44, jobId, projectId, 'running', 'video_clip_generation', 65);
    await logEvent(base44, jobId, 'video_clip_generation', 'step_started', `Generating ${scenes.length} video clips`);

    const clipUrls = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      await logEvent(base44, jobId, 'video_clip_generation', 'step_progress', `Generating clip ${i + 1}/${scenes.length}`, 65 + (i / scenes.length) * 15);

      try {
        console.log(`Calling generateVideoClip for scene ${i + 1}`);
        console.log(`Provider: ${videoIntegration.provider_type}`);
        console.log(`Prompt: ${scene.prompt?.substring(0, 100)}...`);
        console.log(`Duration: ${scene.duration}, AspectRatio: ${project.aspect_ratio}`);

        const clipResult = await base44.asServiceRole.functions.invoke('generateVideoClip', {
          apiKey: videoIntegration.api_key,
          providerType: videoIntegration.provider_type,
          prompt: scene.prompt,
          duration: scene.duration,
          aspectRatio: project.aspect_ratio
        });

        console.log(`Clip ${i + 1} result:`, clipResult.data);

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
        console.error('Error response:', clipError.response?.data);
        console.error('Error status:', clipError.response?.status);
        throw new Error(`Video clip ${i + 1} generation failed: ${clipError.response?.data?.error || clipError.message}`);
      }
    }

    await logEvent(base44, jobId, 'video_clip_generation', 'step_finished', 'All video clips generated', 80);

    // Step 5: Assemble Final Video
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

    // Complete
    await updateJobProgress(base44, jobId, projectId, 'completed', 'completed', 100);
    await logEvent(base44, jobId, 'completion', 'step_finished', 'Video generation completed successfully!', 100);

  } catch (error) {
    console.error('Generation error:', error);
    await updateJobProgress(base44, jobId, projectId, 'failed', 'error', 0, error.message);
    await logEvent(base44, jobId, 'error', 'step_failed', error.message, null, { error: error.stack });
    throw error;
  }
}