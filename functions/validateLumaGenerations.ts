import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Validates Luma generations for a specific job
 * 
 * Queries Luma API to check status of all generations associated with this job
 * Recovers completed videos that didn't trigger callbacks
 * Cleans up failed or timed-out generations
 */

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const { jobId, projectId } = await req.json();
    
    if (!jobId || !projectId) {
      return Response.json({ error: 'Missing jobId or projectId' }, { status: 400 });
    }
    
    console.log(`[Validate Luma] Starting validation for job ${jobId}`);
    
    // Get Luma integration
    const integrations = await base44.asServiceRole.entities.Integration.list();
    const lumaIntegration = integrations.find(i => i.provider_type === 'video_luma');
    
    if (!lumaIntegration) {
      return Response.json({ error: 'Luma integration not configured' }, { status: 500 });
    }
    
    // Query Luma API for recent generations
    const response = await fetch(
      'https://api.lumalabs.ai/dream-machine/v1/generations?limit=50&offset=0',
      {
        headers: {
          'Authorization': `Bearer ${lumaIntegration.api_key}`
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Validate Luma] API error ${response.status}: ${errorText}`);
      return Response.json({ error: `Luma API error: ${response.status}` }, { status: 500 });
    }
    
    const data = await response.json();
    const allGenerations = data.generations || [];
    
    console.log(`[Validate Luma] Retrieved ${allGenerations.length} generations from Luma`);
    
    // Filter generations belonging to this job (by callback_url containing jobId)
    const jobGenerations = allGenerations.filter(gen => 
      gen.request?.callback_url && gen.request.callback_url.includes(jobId)
    );
    
    console.log(`[Validate Luma] Found ${jobGenerations.length} generations for job ${jobId}`);
    
    const results = {
      total: jobGenerations.length,
      completed: 0,
      failed: 0,
      timeout: 0,
      still_pending: 0,
      recovered: []
    };
    
    // Get existing artifacts to avoid duplicates
    const existingClips = await base44.asServiceRole.entities.Artifact.filter({
      job_id: jobId,
      artifact_type: 'video_clip'
    });
    
    const pendingClips = await base44.asServiceRole.entities.Artifact.filter({
      job_id: jobId,
      artifact_type: 'video_clip_pending'
    });
    
    const completedScenes = new Set(existingClips.map(c => c.scene_index));
    const pendingMap = new Map(pendingClips.map(p => [p.metadata?.generation_id, p]));
    
    const MAX_AGE_MS = 20 * 60 * 1000; // 20 minutes
    const now = Date.now();
    
    for (const gen of jobGenerations) {
      const generationId = gen.id;
      const state = gen.state;
      const createdAt = new Date(gen.created_at).getTime();
      const age = now - createdAt;
      const ageMinutes = Math.floor(age / 60000);
      
      // Extract sceneIndex from callback URL
      const callbackUrl = gen.request?.callback_url || '';
      const sceneMatch = callbackUrl.match(/sceneIndex=(\d+)/);
      const sceneIndex = sceneMatch ? parseInt(sceneMatch[1]) : null;
      
      if (sceneIndex === null) {
        console.warn(`[Validate Luma] Could not extract sceneIndex from ${callbackUrl}`);
        continue;
      }
      
      console.log(`[Validate Luma] ${generationId}: scene=${sceneIndex}, state=${state}, age=${ageMinutes}m`);
      
      try {
        if (state === 'completed') {
          // Check if we already have this clip
          if (completedScenes.has(sceneIndex)) {
            console.log(`[Validate Luma] Scene ${sceneIndex} already completed, skipping`);
            results.completed++;
            continue;
          }
          
          // Recover missed callback
          console.log(`[Validate Luma] Recovering completed scene ${sceneIndex} (${generationId})`);
          
          const videoUrl = gen.assets?.video;
          if (!videoUrl) {
            console.error(`[Validate Luma] No video URL for completed generation ${generationId}`);
            continue;
          }
          
          // Download and upload video
          const videoResponse = await fetch(videoUrl);
          if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.status}`);
          }
          
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
              validated: true
            }
          });
          
          // Remove pending artifact
          if (pendingMap.has(generationId)) {
            await base44.asServiceRole.entities.Artifact.delete(pendingMap.get(generationId).id);
          }
          
          // Log event
          await base44.asServiceRole.entities.JobEvent.create({
            job_id: jobId,
            level: 'warning',
            step: 'video_clip_generation',
            event_type: 'step_finished',
            message: `Scene ${sceneIndex} validated: completed (${generationId})`,
            data: {
              provider: 'luma',
              generation_id: generationId,
              scene_index: sceneIndex,
              state: 'completed',
              validated: true
            }
          });
          
          results.completed++;
          results.recovered.push({ sceneIndex, generationId, state: 'completed' });
          
        } else if (state === 'failed') {
          // Clean up failed generation
          console.log(`[Validate Luma] Cleaning up failed scene ${sceneIndex} (${generationId})`);
          
          if (pendingMap.has(generationId)) {
            await base44.asServiceRole.entities.Artifact.delete(pendingMap.get(generationId).id);
          }
          
          await base44.asServiceRole.entities.JobEvent.create({
            job_id: jobId,
            level: 'error',
            step: 'video_clip_generation',
            event_type: 'step_failed',
            message: `Scene ${sceneIndex} validated: failed (${generationId})`,
            data: {
              provider: 'luma',
              generation_id: generationId,
              scene_index: sceneIndex,
              state: 'failed',
              failure_reason: gen.failure_reason,
              validated: true
            }
          });
          
          results.failed++;
          results.recovered.push({ sceneIndex, generationId, state: 'failed' });
          
        } else if (state === 'dreaming') {
          if (age > MAX_AGE_MS) {
            // Timeout - cancel this generation
            console.log(`[Validate Luma] Timeout for scene ${sceneIndex} (${generationId}, ${ageMinutes}m)`);
            
            if (pendingMap.has(generationId)) {
              await base44.asServiceRole.entities.Artifact.delete(pendingMap.get(generationId).id);
            }
            
            await base44.asServiceRole.entities.JobEvent.create({
              job_id: jobId,
              level: 'error',
              step: 'video_clip_generation',
              event_type: 'step_failed',
              message: `Scene ${sceneIndex} timed out (${generationId}, ${ageMinutes}m)`,
              data: {
                provider: 'luma',
                generation_id: generationId,
                scene_index: sceneIndex,
                state: 'dreaming',
                age_minutes: ageMinutes,
                timeout: true,
                validated: true
              }
            });
            
            results.timeout++;
            results.recovered.push({ sceneIndex, generationId, state: 'timeout' });
          } else {
            // Still processing normally
            results.still_pending++;
          }
        }
        
      } catch (error) {
        console.error(`[Validate Luma] Error processing ${generationId}:`, error.message);
      }
    }
    
    console.log(`[Validate Luma] Summary:`, results);
    
    return Response.json({
      success: true,
      summary: results
    });
    
  } catch (error) {
    console.error('[Validate Luma] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});