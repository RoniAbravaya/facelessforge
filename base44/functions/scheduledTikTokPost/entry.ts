import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await req.json();

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    // Get project
    const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
    const project = projects[0];

    if (!project) {
      throw new Error('Project not found');
    }

    if (!project.tiktok_settings?.enabled) {
      throw new Error('TikTok posting not enabled for this project');
    }

    // Get final video artifact
    const artifacts = await base44.asServiceRole.entities.Artifact.filter({
      project_id: projectId,
      artifact_type: 'final_video'
    });

    if (artifacts.length === 0) {
      throw new Error('No final video found for this project');
    }

    const videoUrl = artifacts[0].file_url;

    // Post to TikTok
    const result = await base44.asServiceRole.functions.invoke('postToTikTok', {
      videoUrl,
      caption: project.tiktok_settings.caption,
      privacyLevel: project.tiktok_settings.privacy_level,
      isDraft: false,
      projectId
    });

    console.log('[Scheduled Post] TikTok post result:', result.data);

    return Response.json({
      success: true,
      message: 'Scheduled TikTok post completed',
      result: result.data
    });

  } catch (error) {
    console.error('[Scheduled Post] Error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});