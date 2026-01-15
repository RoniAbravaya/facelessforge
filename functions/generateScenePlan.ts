import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { apiKey, script, duration, style } = await req.json();

    console.log('Generating scene plan...');
    console.log(`Script length: ${script?.length || 0} chars`);
    console.log(`Duration: ${duration}s, Style: ${style}`);

    if (!script || script.trim().length === 0) {
      throw new Error('Script is empty or undefined');
    }

    const prompt = `You are a video production planner. Analyze this script and create a scene breakdown for video generation.

Script: "${script}"

Total Duration: ${duration} seconds
Visual Style: ${style || 'cinematic'}

Create 3-5 scenes that:
- Cover the entire script duration
- Each scene should be 3-10 seconds
- Total duration must equal ${duration} seconds
- Include detailed visual prompts for AI video generation

Return a JSON object with a "scenes" array. Each scene must have:
- "duration": number (in seconds)
- "text": "portion of script for this scene"
- "prompt": "detailed visual description for AI video generation, ${style} style"

Example:
{
  "scenes": [
    {
      "duration": 5,
      "text": "portion of script",
      "prompt": "Cinematic aerial shot of vast ocean at sunset, dramatic clouds, 4K quality, smooth camera movement"
    }
  ]
}`;

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
      const errorText = await response.text();
      console.error(`OpenAI API error (${response.status}):`, errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(`OpenAI API error: ${error.error?.message || errorText}`);
      } catch {
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }
    }

    const data = await response.json();
    console.log('OpenAI response received');
    
    let result;
    try {
      result = JSON.parse(data.choices[0].message.content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', data.choices[0].message.content);
      throw new Error('Invalid JSON response from OpenAI');
    }
    
    // Extract scenes array if wrapped in object
    let scenes = Array.isArray(result) ? result : result.scenes;
    
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      console.error('Invalid scenes data:', result);
      throw new Error('No valid scenes generated');
    }

    console.log(`Generated ${scenes.length} scenes`);

    // Validate scene structure
    scenes.forEach((scene, idx) => {
      if (!scene.duration || !scene.prompt) {
        console.error(`Scene ${idx} missing required fields:`, scene);
        throw new Error(`Scene ${idx} is missing duration or prompt`);
      }
    });

    // Validate and adjust durations to fit 4-8 second range for video generation APIs
    let totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
    console.log(`Total scene duration: ${totalDuration}s (target: ${duration}s)`);
    
    // Clamp each scene to 4-8 seconds and recalculate total
    scenes.forEach(s => {
      s.duration = Math.max(4, Math.min(8, Math.round(s.duration)));
    });
    
    totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
    console.log(`After clamping to 4-8s range: ${totalDuration}s`);
    
    // If total doesn't match target duration, adjust scenes proportionally
    if (Math.abs(totalDuration - duration) > 2) {
      const ratio = Math.max(0.5, Math.min(1.5, duration / totalDuration));
      scenes.forEach(s => {
        s.duration = Math.max(4, Math.min(8, Math.round(s.duration * ratio)));
      });
      console.log('Adjusted scene durations while maintaining 4-8s bounds');
    }

    return Response.json({ scenes });

  } catch (error) {
    console.error('Generate scene plan error:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});