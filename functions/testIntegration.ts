import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { integrationId } = await req.json();

    const integrations = await base44.entities.Integration.filter({ id: integrationId });
    const integration = integrations[0];

    if (!integration) {
      return Response.json({ success: false, error: 'Integration not found' }, { status: 404 });
    }

    const apiKey = integration.api_key;

    // Test based on provider type
    switch (integration.provider_type) {
      case 'llm_openai': {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        
        if (response.ok) {
          return Response.json({ success: true, message: 'OpenAI connection successful' });
        } else {
          const error = await response.json();
          return Response.json({ success: false, error: error.error?.message || 'Invalid API key' });
        }
      }

      case 'voice_elevenlabs': {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: {
            'xi-api-key': apiKey
          }
        });
        
        if (response.ok) {
          return Response.json({ success: true, message: 'ElevenLabs connection successful' });
        } else {
          return Response.json({ success: false, error: 'Invalid API key' });
        }
      }

      case 'video_luma': {
        const response = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok || response.status === 404) {
          return Response.json({ success: true, message: 'Luma AI connection successful' });
        } else {
          return Response.json({ success: false, error: 'Invalid API key' });
        }
      }

      case 'video_runway': {
        return Response.json({ 
          success: true, 
          message: 'Runway ML connection test not available (API key format accepted)' 
        });
      }

      case 'assembly_shotstack': {
        const response = await fetch('https://api.shotstack.io/v1/sources', {
          headers: {
            'x-api-key': apiKey
          }
        });
        
        if (response.ok || response.status === 404) {
          return Response.json({ success: true, message: 'Shotstack connection successful' });
        } else {
          return Response.json({ success: false, error: 'Invalid API key' });
        }
      }

      case 'assembly_creatomate':
      case 'assembly_bannerbear':
      case 'assembly_json2video':
      case 'assembly_plainly': {
        return Response.json({ 
          success: true, 
          message: `${integration.provider_name} API key saved (connection test not implemented)` 
        });
      }

      default:
        return Response.json({ success: false, error: 'Unknown provider type' });
    }
  } catch (error) {
    console.error('Test integration error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});