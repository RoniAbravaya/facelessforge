import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Webhook handler for Luma Dream Machine callbacks
 * 
 * Luma POSTs to this endpoint with generation updates:
 * - state: "dreaming" | "completed" | "failed"
 * - id: generation ID
 * - assets.video: final video URL (when completed)
 * - failure_reason: error details (when failed)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse callback data from Luma
    const payload = await req.json();
    console.log(`[Luma Callback] Received:`, JSON.stringify(payload, null, 2));
    
    const { id: generationId, state, assets, failure_reason } = payload;
    
    // Extract job context from query parameters
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    const sceneIndex = url.searchParams.get('sceneIndex');
    const projectId = url.searchParams.get('projectId');
    
    if (!jobId || !projectId) {
      console.error('[Luma Callback] Missing jobId or projectId in query params');
      return Response.json({ error: 'Missing context parameters' }, { status: 400 });
    }
    
    console.log(`[Luma Callback] Context: jobId=${jobId}, sceneIndex=${sceneIndex}, projectId=${projectId}`);
    
    // Log event based on state
    const eventBase = {
      job_id: jobId,
      level: 'info',
      step: 'video_clip_generation',
      data: { 
        provider: 'luma',
        generation_id: generationId,
        scene_index: parseInt(sceneIndex),
        state: state
      }
    };
    
    if (state === 'dreaming') {
      // Still generating
      await base44.asServiceRole.entities.JobEvent.create({
        ...eventBase,
        event_type: 'step_progress',
        message: `Scene ${sceneIndex} processing (${generationId})`,
        progress: 50
      });
      
      console.log(`[Luma Callback] Generation ${generationId} still dreaming`);
      return Response.json({ status: 'acknowledged' }, { status: 200 });
      
    } else if (state === 'completed') {
      // Success - get video URL
      const videoUrl = assets?.video;
      
      if (!videoUrl) {
        console.error(`[Luma Callback] No video URL in completed generation ${generationId}`);
        await base44.asServiceRole.entities.JobEvent.create({
          ...eventBase,
          level: 'error',
          event_type: 'step_failed',
          message: `Luma generation ${generationId} completed but no video URL provided`
        });
        return Response.json({ status: 'error', message: 'No video URL' }, { status: 400 });
      }
      
      console.log(`[Luma Callback] ✅ Generation ${generationId} completed: ${videoUrl}`);
      
      // Upload the video to Base44 storage
      console.log(`[Luma Callback] Uploading video from ${videoUrl}...`);
      const videoResponse = await fetch(videoUrl);
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`);
      }
      
      const videoBlob = await videoResponse.blob();
      const videoFile = new File([videoBlob], `luma_${generationId}.mp4`, { type: 'video/mp4' });
      
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: videoFile });
      const uploadedUrl = uploadResult.file_url;
      
      console.log(`[Luma Callback] Uploaded to Base44: ${uploadedUrl}`);
      
      // Remove ALL pending artifacts for this scene (cleanup obsolete generations)
      const pendingArtifacts = await base44.asServiceRole.entities.Artifact.filter({
        job_id: jobId,
        artifact_type: 'video_clip_pending',
        scene_index: parseInt(sceneIndex)
      });
      
      if (pendingArtifacts.length > 0) {
        console.log(`[Luma Callback] Cleaning up ${pendingArtifacts.length} pending artifact(s) for scene ${sceneIndex}`);
        for (const pending of pendingArtifacts) {
          await base44.asServiceRole.entities.Artifact.delete(pending.id);
          console.log(`[Luma Callback] ✓ Deleted pending artifact: ${pending.metadata?.generation_id || pending.id}`);
        }
      }
      
      // Create completed artifact
      await base44.asServiceRole.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'video_clip',
        file_url: uploadedUrl,
        scene_index: parseInt(sceneIndex),
        metadata: {
          provider: 'luma',
          generation_id: generationId,
          original_url: videoUrl
        }
      });
      
      // Log success event
      await base44.asServiceRole.entities.JobEvent.create({
        ...eventBase,
        level: 'success',
        event_type: 'step_progress',
        message: `Scene ${sceneIndex} completed (${generationId})`,
        progress: 100,
        data: { ...eventBase.data, uploaded_url: uploadedUrl }
      });
      
      console.log(`[Luma Callback] ✅ Scene ${sceneIndex} artifact created`);
      
      // Check if all clips are done or if we need to continue generation
      const allCompletedClips = await base44.asServiceRole.entities.Artifact.filter({
        job_id: jobId,
        artifact_type: 'video_clip'
      });
      
      const remainingPending = await base44.asServiceRole.entities.Artifact.filter({
        job_id: jobId,
        artifact_type: 'video_clip_pending'
      });
      
      // Get the scene plan to know total number of scenes
      const scenePlanArtifact = await base44.asServiceRole.entities.Artifact.filter({
        job_id: jobId,
        artifact_type: 'scene_plan'
      }, '-created_date', 1);
      
      if (scenePlanArtifact[0]?.metadata?.scenes) {
        const totalScenes = scenePlanArtifact[0].metadata.scenes.length;
        const completedCount = allCompletedClips.length;
        const pendingCount = remainingPending.length;
        
        console.log(`[Luma Callback] Progress: ${completedCount}/${totalScenes} completed, ${pendingCount} pending`);
        
        if (completedCount >= totalScenes) {
          console.log(`[Luma Callback] ✅ All ${totalScenes} clips complete, triggering assembly`);
          
          // Trigger assembly step
          await base44.asServiceRole.functions.invoke('startVideoGeneration', {
            projectId,
            jobId,
            resumeFromStep: 'video_assembly'
          });
        } else if (pendingCount === 0) {
          // No pending clips but not all completed - resume generation
          console.log(`[Luma Callback] Resuming clip generation (${completedCount}/${totalScenes} done)`);
          
          await base44.asServiceRole.functions.invoke('startVideoGeneration', {
            projectId,
            jobId,
            resumeFromStep: 'video_clip_generation'
          });
        } else {
          console.log(`[Luma Callback] Waiting for ${pendingCount} pending clips to complete`);
        }
      }
      
      return Response.json({ status: 'success', uploadedUrl }, { status: 200 });
      
    } else if (state === 'failed') {
      // Generation failed
      console.error(`[Luma Callback] ❌ Generation ${generationId} failed: ${failure_reason}`);
      
      // Remove pending artifact
      const pendingArtifacts = await base44.asServiceRole.entities.Artifact.filter({
        job_id: jobId,
        artifact_type: 'video_clip_pending',
        scene_index: parseInt(sceneIndex)
      });
      
      for (const pending of pendingArtifacts) {
        await base44.asServiceRole.entities.Artifact.delete(pending.id);
        console.log(`[Luma Callback] Removed pending artifact for failed scene ${sceneIndex}`);
      }
      
      await base44.asServiceRole.entities.JobEvent.create({
        ...eventBase,
        level: 'error',
        event_type: 'step_failed',
        message: `Scene ${sceneIndex} failed: ${failure_reason || 'Unknown error'} (${generationId})`,
        data: { ...eventBase.data, failure_reason }
      });
      
      // Mark job as failed if this was a critical clip
      await base44.asServiceRole.entities.Job.update(jobId, {
        status: 'failed',
        error_message: `Luma generation failed for scene ${sceneIndex}: ${failure_reason}`
      });
      
      await base44.asServiceRole.entities.Project.update(projectId, {
        status: 'failed',
        error_message: `Video generation failed at scene ${sceneIndex}: ${failure_reason}`
      });
      
      return Response.json({ status: 'failure_recorded' }, { status: 200 });
      
    } else {
      console.warn(`[Luma Callback] Unknown state: ${state}`);
      return Response.json({ status: 'unknown_state' }, { status: 200 });
    }
    
  } catch (error) {
    console.error('[Luma Callback] Error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});