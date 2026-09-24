import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const correlationId = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const url = new URL(req.url);
    const mediaUrl = url.searchParams.get('url');
    const projectId = url.searchParams.get('projectId');
    
    if (!mediaUrl) {
      return Response.json({ 
        errorCode: 'missing_url',
        error: 'Missing url parameter',
        correlationId 
      }, { status: 400 });
    }

    console.log(`[Proxy ${correlationId}] Original URL: ${mediaUrl}`);
    console.log(`[Proxy ${correlationId}] ProjectId: ${projectId || 'not provided'}`);

    // Check if this is a Google Generative Language API URL
    const isGoogleFile = mediaUrl.includes('generativelanguage.googleapis.com');
    let finalUrl = mediaUrl;
    
    if (isGoogleFile) {
      // Get user's Gemini API key from integrations
      const integrations = await base44.asServiceRole.entities.Integration.list();
      const geminiIntegration = integrations.find(i => i.provider_type === 'gemini_api');
      
      if (!geminiIntegration?.api_key) {
        console.error(`[Proxy ${correlationId}] Google file download requires Gemini API key`);
        return Response.json({ 
          errorCode: 'missing_gemini_key',
          error: 'Gemini API Key required. Add it in Integrations page to download Veo clips.',
          correlationId
        }, { status: 403 });
      }
      
      const keySource = 'integration';
      const keyLast4 = geminiIntegration.api_key.slice(-4);
      console.log(`[Proxy ${correlationId}] Key source: ${keySource}, last4: ${keyLast4}, projectId: ${projectId}`);
      
      // Append key as query parameter (not header)
      const separator = mediaUrl.includes('?') ? '&' : '?';
      finalUrl = `${mediaUrl}${separator}key=${geminiIntegration.api_key}`;
      console.log(`[Proxy ${correlationId}] Modified URL with key param (last 80 chars): ...${finalUrl.slice(-80)}`);
    }

    console.log(`[Proxy ${correlationId}] Fetching with plain fetch (no headers)...`);
    const response = await fetch(finalUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy ${correlationId}] Fetch failed: ${response.status} ${response.statusText}`);
      console.error(`[Proxy ${correlationId}] Error body:`, errorText);
      
      // Try to parse error JSON and extract Google project ID
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorText);
        console.error(`[Proxy ${correlationId}] Parsed error JSON:`, JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error(`[Proxy ${correlationId}] Error not JSON`);
      }
      
      const projectMatch = errorText.match(/project (\d+)/);
      if (projectMatch) {
        console.error(`[Proxy ${correlationId}] Google consumer project from error: ${projectMatch[1]}`);
      }
      
      if (response.status === 403 && isGoogleFile) {
        if (errorText.includes('SERVICE_DISABLED') || errorText.includes('disabled')) {
          return Response.json({ 
            errorCode: 'service_disabled',
            error: 'Your Gemini API key\'s Google Cloud project must have Generative Language API enabled. Go to console.cloud.google.com, enable the API, then add that project\'s key in Integrations.',
            details: errorText,
            errorJson: errorJson,
            correlationId
          }, { status: 403 });
        }
        return Response.json({ 
          errorCode: 'access_denied',
          error: 'Gemini API access denied. Verify your API key in Integrations has Generative Language API enabled.',
          details: errorText,
          errorJson: errorJson,
          correlationId
        }, { status: 403 });
      }
      
      return Response.json({ 
        errorCode: 'fetch_failed',
        error: `Failed to fetch media: ${response.status}`,
        details: errorText,
        errorJson: errorJson,
        correlationId
      }, { status: response.status });
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    console.log(`[Proxy ${correlationId}] Success: ${data.byteLength} bytes, type: ${contentType}`);

    return new Response(data, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    console.error(`[Proxy ${correlationId}] Error:`, error);
    return Response.json({ 
      errorCode: 'proxy_error',
      error: error.message,
      correlationId
    }, { status: 500 });
  }
});