/**
 * Generate video scene plan from script using OpenAI GPT-4o-mini.
 * Breaks script into visual scenes with prompts for AI video generation.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createRequestLogger, getUserFriendlyError, ErrorMessages } from './utils/logger.ts';

Deno.serve(async (req) => {
  const logger = createRequestLogger(req, 'generateScenePlan');
  
  try {
    const { apiKey, script, duration, style } = await req.json();

    // Input validation
    if (!apiKey) {
      logger.error('Missing API key');
      return Response.json({ error: ErrorMessages.MISSING_REQUIRED_FIELD('apiKey') }, { status: 400 });
    }

    logger.info('Starting scene planning', { 
      scriptLength: script?.length || 0, 
      duration, 
      style: style?.substring(0, 30) 
    });

    if (!script || script.trim().length === 0) {
      logger.error('Script is empty or undefined');
      throw new Error(ErrorMessages.MISSING_REQUIRED_FIELD('script'));
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
      logger.error('OpenAI API error', null, { status: response.status, error: errorText });
      
      try {
        const errorData = JSON.parse(errorText);
        const message = errorData.error?.message || errorText;
        
        if (response.status === 401) {
          throw new Error(ErrorMessages.INVALID_API_KEY);
        }
        if (response.status === 429) {
          throw new Error(ErrorMessages.RATE_LIMITED);
        }
        
        throw new Error(`OpenAI error: ${message}`);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes('OpenAI')) {
          throw parseError;
        }
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }
    }

    const data = await response.json();
    logger.info('OpenAI response received', { tokensUsed: data.usage?.total_tokens });
    
    let result;
    try {
      result = JSON.parse(data.choices[0].message.content);
    } catch (parseError) {
      logger.error('Failed to parse OpenAI response', parseError, { 
        response: data.choices[0].message.content.substring(0, 200) 
      });
      throw new Error(ErrorMessages.SCENE_PLANNING_FAILED);
    }
    
    // Extract scenes array if wrapped in object
    let scenes = Array.isArray(result) ? result : result.scenes;
    
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      logger.error('Invalid scenes data', null, { result });
      throw new Error(ErrorMessages.SCENE_PLANNING_FAILED);
    }

    logger.info('Scenes parsed', { sceneCount: scenes.length });

    // Validate scene structure
    scenes.forEach((scene, idx) => {
      if (!scene.duration || !scene.prompt) {
        logger.warn(`Scene ${idx} missing required fields`, { scene });
        // Fill in defaults instead of throwing
        scene.duration = scene.duration || 5;
        scene.prompt = scene.prompt || `Visual scene ${idx + 1} for the video`;
      }
    });

    // Validate and adjust durations to fit 4-8 second range for video generation APIs
    let totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
    logger.info('Duration calculation', { totalDuration, targetDuration: duration });
    
    // Clamp each scene to 4-8 seconds and recalculate total
    scenes.forEach(s => {
      s.duration = Math.max(4, Math.min(8, Math.round(s.duration)));
    });
    
    totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
    logger.info('After clamping', { totalDuration, clampedTo: '4-8s per scene' });
    
    // If total doesn't match target duration, adjust scenes proportionally
    if (Math.abs(totalDuration - duration) > 2) {
      const ratio = Math.max(0.5, Math.min(1.5, duration / totalDuration));
      scenes.forEach(s => {
        s.duration = Math.max(4, Math.min(8, Math.round(s.duration * ratio)));
      });
      const adjustedTotal = scenes.reduce((sum, s) => sum + s.duration, 0);
      logger.info('Adjusted scene durations', { ratio, adjustedTotal });
    }

    const finalTotal = scenes.reduce((sum, s) => sum + s.duration, 0);
    logger.info('Scene plan complete', { 
      sceneCount: scenes.length, 
      totalDuration: finalTotal,
      tokensUsed: data.usage?.total_tokens 
    });

    return Response.json({ 
      scenes,
      metadata: {
        sceneCount: scenes.length,
        totalDuration: finalTotal,
        tokensUsed: data.usage?.total_tokens
      }
    });

  } catch (error) {
    logger.error('Scene planning failed', error);
    
    const userMessage = getUserFriendlyError(error, 'Scene planning');
    return Response.json({ 
      error: userMessage,
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});