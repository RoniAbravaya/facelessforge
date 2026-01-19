import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Watchdog function to check for stalled Luma generations
 * Polls Luma API for pending jobs and handles missing callbacks
 * 
 * Should be called periodically (e.g. every 5-10 minutes via automation)
 * 
 * Handles:
 * - Completed jobs that didn't receive callbacks
 * - Failed jobs that weren't reported
 * - Jobs exceeding timeout threshold (30 minutes)
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    // Maximum age for a pending job (30 minutes)
    const MAX_AGE_MS = 30 * 60 * 1000;
    const now = Date.now();
    
    // Get all pending Luma generations
    const allPending = await base44.asServiceRole.entities.Artifact.filter({
      artifact_type: 'video_clip_pending'
    });
    
    console.log(`[Watchdog] Found ${allPending.length} pending Luma jobs`);
    
    if (allPending.length === 0) {
      return Response.json({ 
        message: 'No pending jobs found',
        checked: 0 
      });
    }
    
    // Get Luma integration for API key
    const integrations = await base44.asServiceRole.entities.Integration.list();
    const lumaIntegration = integrations.find(i => i.provider_type === 'video_luma');
    
    if (!lumaIntegration) {
      console.error('[Watchdog] No Luma integration found');
      return Response.json({ error: 'Luma integration not configured' }, { status: 500 });
    }
    
    const results = {
      checked: allPending.length,
      completed: 0,
      failed: 0,
      timeout: 0,
      still_pending: 0,
      errors: []
    };
    
    for (const pending of allPending) {
      const generationId = pending.metadata?.generation_id;
      const jobId = pending.job_id;
      const projectId = pending.project_id;
      const sceneIndex = pending.scene_index;
      const initiatedAt = new Date(pending.metadata?.initiated_at || pending.created_date).getTime();
      const age = now - initiatedAt;
      const ageMinutes = Math.floor(age / 60000);
      
      console.log(`[Watchdog] Checking ${generationId} (scene ${sceneIndex}, age: ${ageMinutes}m)`);
      
      try {
        // Check Luma API status
        const response = await fetch(
          `https://api.lumalabs.ai/dream-machine/v1/generations/${generationId}`,
          {
            headers: {
              'Authorization': `Bearer ${lumaIntegration.api_key}`
            }
          }
        );
        
        if (!response.ok) {
          console.error(`[Watchdog] Failed to check ${generationId}: ${response.status}`);
          results.errors.push({
            generationId,
            sceneIndex,
            error: `API error: ${response.status}`
          });
          continue;
        }
        
        const data = await response.json();
        const state = data.state;
        
        console.log(`[Watchdog] ${generationId} state: ${state}, age: ${ageMinutes}m`);
        
        if (state === 'completed') {
          // Job completed but callback was missed - handle manually
          console.log(`[Watchdog] ⚠️ Missed callback for ${generationId} - processing manually`);
          
          const videoUrl = data.assets?.video || data.video_url;
          
          if (!videoUrl) {
            throw new Error('No video URL in completed generation');
          }
          
          // Download and upload video
          const videoResponse = await fetch(videoUrl);
          const videoBlob = await videoResponse.blob();
          const videoFile = new File([videoBlob], `luma_${generationId}.mp4`, { type: 'video/mp4' });
          
          const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: videoFile });
          
          // Create completed artifact
          await base44.asServiceRole.entities.Artifact.create({
            job_id: jobId,
            project_id: projectId,
            artifact_type: 'video_clip',
            file_url: uploadResult.file_url,
            scene_index: sceneIndex,
            metadata: {
              provider: 'luma',
              generation_id: generationId,
              original_url: videoUrl,
              recovered_by_watchdog: true
            }
          });
          
          // Remove pending artifact
          await base44.asServiceRole.entities.Artifact.delete(pending.id);
          
          // Log event
          await base44.asServiceRole.entities.JobEvent.create({
            job_id: jobId,
            level: 'warning',
            step: 'video_clip_generation',
            event_type: 'step_finished',
            message: `Scene ${sceneIndex} recovered by watchdog (missed callback)`,
            data: {
              provider: 'luma',
              generation_id: generationId,
              scene_index: sceneIndex,
              recovered: true
            }
          });
          
          results.completed++;
          
          // Trigger resumption
          await base44.asServiceRole.functions.invoke('startVideoGeneration', {
            projectId,
            jobId,
            resumeFromStep: 'video_clip_generation'
          });
          
        } else if (state === 'failed') {
          // Job failed but callback was missed
          console.log(`[Watchdog] ⚠️ Missed failure callback for ${generationId}`);
          
          await base44.asServiceRole.entities.Artifact.delete(pending.id);
          
          await base44.asServiceRole.entities.JobEvent.create({
            job_id: jobId,
            level: 'error',
            step: 'video_clip_generation',
            event_type: 'step_failed',
            message: `Scene ${sceneIndex} failed (discovered by watchdog)`,
            data: {
              provider: 'luma',
              generation_id: generationId,
              scene_index: sceneIndex,
              failure_reason: data.failure_reason || 'Unknown'
            }
          });
          
          results.failed++;
          
        } else if (age > MAX_AGE_MS) {
          // Job exceeded timeout threshold
          console.log(`[Watchdog] ⚠️ Timeout for ${generationId} (${ageMinutes}m > 30m)`);
          
          await base44.asServiceRole.entities.Artifact.delete(pending.id);
          
          await base44.asServiceRole.entities.JobEvent.create({
            job_id: jobId,
            level: 'error',
            step: 'video_clip_generation',
            event_type: 'step_failed',
            message: `Scene ${sceneIndex} timed out after ${ageMinutes} minutes`,
            data: {
              provider: 'luma',
              generation_id: generationId,
              scene_index: sceneIndex,
              state: state,
              age_minutes: ageMinutes
            }
          });
          
          await base44.asServiceRole.entities.Job.update(jobId, {
            status: 'failed',
            error_message: `Luma generation timeout for scene ${sceneIndex} (${ageMinutes}m)`
          });
          
          await base44.asServiceRole.entities.Project.update(projectId, {
            status: 'failed',
            error_message: `Video generation timeout at scene ${sceneIndex}`
          });
          
          results.timeout++;
          
        } else {
          // Still pending - normal
          console.log(`[Watchdog] ${generationId} still ${state} (${ageMinutes}m)`);
          results.still_pending++;
        }
        
      } catch (error) {
        console.error(`[Watchdog] Error checking ${generationId}:`, error.message);
        results.errors.push({
          generationId,
          sceneIndex,
          error: error.message
        });
      }
    }
    
    console.log(`[Watchdog] Summary:`, results);
    
    return Response.json({
      success: true,
      summary: results
    });
    
  } catch (error) {
    console.error('[Watchdog] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});