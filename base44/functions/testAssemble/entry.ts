import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    // Get the artifacts
    const clipArtifacts = await base44.asServiceRole.entities.Artifact.filter({ 
      job_id: '696c8bf308d051f356d1509a',
      artifact_type: 'video_clip' 
    });
    
    const voiceArtifact = await base44.asServiceRole.entities.Artifact.filter({ 
      job_id: '696c8bf308d051f356d1509a',
      artifact_type: 'voiceover' 
    });
    
    const scenePlan = await base44.asServiceRole.entities.Artifact.filter({ 
      job_id: '696c8bf308d051f356d1509a',
      artifact_type: 'scene_plan' 
    });
    
    const clipUrls = clipArtifacts
      .sort((a, b) => a.scene_index - b.scene_index)
      .map(c => c.file_url);
    
    const audioUrl = voiceArtifact[0]?.file_url;
    const scenes = scenePlan[0]?.metadata?.scenes;
    
    console.log('=== TEST ASSEMBLY ===');
    console.log('Clip URLs:', clipUrls);
    console.log('Audio URL:', audioUrl);
    console.log('Scenes:', JSON.stringify(scenes, null, 2));
    
    // Call assembleVideo
    const result = await base44.asServiceRole.functions.invoke('assembleVideo', {
      apiKey: '9HxkR44Z1V4C2pLHMuXIHl59MWEXbdhbgmVwSpXa',
      providerType: 'assembly_shotstack',
      clipUrls,
      audioUrl,
      scenes,
      aspectRatio: '9:16',
      title: 'test6'
    });
    
    return Response.json({ success: true, result: result.data });
    
  } catch (error) {
    console.error('Test error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});