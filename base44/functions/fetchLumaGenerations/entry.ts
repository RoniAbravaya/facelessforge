import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { apiKey } = await req.json();

    console.log('Fetching all Luma generations...');
    
    const response = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Luma API error (${response.status}):`, errorText);
      throw new Error(`Failed to fetch generations: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Found ${data.generatedSamples?.length || 0} generations`);
    
    // Filter for completed generations
    const completed = data.generatedSamples?.filter(g => g.state === 'completed') || [];
    
    console.log(`Completed generations: ${completed.length}`);
    console.log('Generation details:', JSON.stringify(completed.map(g => ({
      id: g.id,
      state: g.state,
      prompt: g.prompt?.substring(0, 50),
      videoUrl: g.assets?.video || g.video_url
    })), null, 2));

    return Response.json({ 
      total: data.generatedSamples?.length || 0,
      completed: completed.length,
      generations: completed.map(g => ({
        id: g.id,
        state: g.state,
        prompt: g.prompt,
        videoUrl: g.assets?.video || g.video_url,
        createdAt: g.created_at
      }))
    });

  } catch (error) {
    console.error('Fetch Luma generations error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});