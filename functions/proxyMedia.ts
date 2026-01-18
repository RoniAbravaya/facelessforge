import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const mediaUrl = url.searchParams.get('url');
    
    if (!mediaUrl) {
      return Response.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    console.log(`[Proxy] Fetching: ${mediaUrl}`);

    const response = await fetch(mediaUrl);
    
    if (!response.ok) {
      return Response.json({ 
        error: `Failed to fetch media: ${response.status}` 
      }, { status: response.status });
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    console.log(`[Proxy] Success: ${data.byteLength} bytes, type: ${contentType}`);

    return new Response(data, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    console.error('[Proxy] Error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});