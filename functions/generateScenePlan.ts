import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { apiKey, script, duration, style } = await req.json();

    const prompt = `You are a video production planner. Analyze this script and create a scene breakdown for video generation.

Script: "${script}"

Total Duration: ${duration} seconds
Visual Style: ${style || 'cinematic'}

Create 3-5 scenes that:
- Cover the entire script duration
- Each scene should be 3-10 seconds
- Total duration must equal ${duration} seconds
- Include detailed visual prompts for AI video generation

Return ONLY a JSON array with this exact structure:
[
  {
    "duration": 5,
    "text": "portion of script for this scene",
    "prompt": "detailed visual description for AI video generation, ${style} style"
  }
]

Example prompt style: "Cinematic aerial shot of vast ocean at sunset, dramatic clouds, 4K quality, smooth camera movement"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a video production planner. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI API error');
    }

    const data = await response.json();
    let result = JSON.parse(data.choices[0].message.content);
    
    // Extract scenes array if wrapped in object
    const scenes = result.scenes || result;

    // Validate and adjust durations
    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
    if (Math.abs(totalDuration - duration) > 2) {
      const ratio = duration / totalDuration;
      scenes.forEach(s => {
        s.duration = Math.round(s.duration * ratio);
      });
    }

    return Response.json({ scenes });

  } catch (error) {
    console.error('Generate scene plan error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});