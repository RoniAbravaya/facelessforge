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
      data: { generationId, sceneIndex, state }
    };
    
    if (state === 'dreaming') {
      // Still generating
      await base44.asServiceRole.entities.JobEvent.create({
        ...eventBase,
        event_type: 'step_progress',
        message: `Luma generation ${generationId} (scene ${sceneIndex}) is processing...`,
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
      
      // Create artifact
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
        message: `Scene ${sceneIndex} video generated and uploaded`,
        progress: 100,
        data: { ...eventBase.data, uploadedUrl }
      });
      
      console.log(`[Luma Callback] ✅ Scene ${sceneIndex} artifact created`);
      
      // Check if all clips are done and trigger assembly
      const job = await base44.asServiceRole.entities.Job.get(jobId);
      const allArtifacts = await base44.asServiceRole.entities.Artifact.filter({
        job_id: jobId,
        artifact_type: 'video_clip'
      });
      
      // Get the scene plan to know total number of scenes
      const scenePlanArtifact = await base44.asServiceRole.entities.Artifact.filter({
        job_id: jobId,
        artifact_type: 'scene_plan'
      }, '-created_date', 1);
      
      if (scenePlanArtifact[0]?.metadata?.scenes) {
        const totalScenes = scenePlanArtifact[0].metadata.scenes.length;
        
        if (allArtifacts.length >= totalScenes) {
          console.log(`[Luma Callback] All ${totalScenes} clips complete, triggering assembly`);
          
          // Trigger assembly step
          await base44.asServiceRole.functions.invoke('startVideoGeneration', {
            projectId,
            jobId,
            resumeFromStep: 'video_assembly'
          });
        } else {
          console.log(`[Luma Callback] ${allArtifacts.length}/${totalScenes} clips complete, waiting for more`);
        }
      }
      
      return Response.json({ status: 'success', uploadedUrl }, { status: 200 });
      
    } else if (state === 'failed') {
      // Generation failed
      console.error(`[Luma Callback] ❌ Generation ${generationId} failed: ${failure_reason}`);
      
      await base44.asServiceRole.entities.JobEvent.create({
        ...eventBase,
        level: 'error',
        event_type: 'step_failed',
        message: `Scene ${sceneIndex} generation failed: ${failure_reason || 'Unknown error'}`,
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