/**
 * Generate video script using OpenAI GPT-4o-mini.
 * Creates engaging narration optimized for the specified duration and style.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createRequestLogger, getUserFriendlyError, ErrorMessages } from './utils/logger.ts';

Deno.serve(async (req) => {
  const logger = createRequestLogger(req, 'generateScript');
  
  try {
    const { apiKey, topic, duration, language, style } = await req.json();

    // Input validation
    if (!apiKey) {
      logger.error('Missing API key');
      return Response.json({ error: ErrorMessages.MISSING_REQUIRED_FIELD('apiKey') }, { status: 400 });
    }
    
    if (!topic || topic.trim().length === 0) {
      logger.error('Missing or empty topic');
      return Response.json({ error: ErrorMessages.MISSING_REQUIRED_FIELD('topic') }, { status: 400 });
    }

    logger.info('Starting script generation', { 
      topicPreview: topic.substring(0, 50), 
      duration, 
      language,
      style: style?.substring(0, 30)
    });

    const prompt = `You are a professional video script writer. Create an engaging, concise script for a ${duration}-second video about: ${topic}

Requirements:
- Language: ${language}
- Duration: Exactly ${duration} seconds when read at natural pace
- Style: ${style || 'engaging and informative'}
- Format: Write ONLY the script narration, no titles or scene descriptions
- Tone: Captivating, suitable for social media
- Structure: Hook in first 3 seconds, clear flow, strong conclusion

Return ONLY the script text, nothing else.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional video script writer.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('OpenAI API error', null, { status: response.status, error: errorText });
      
      try {
        const errorData = JSON.parse(errorText);
        const message = errorData.error?.message || errorText;
        
        // Handle specific OpenAI errors
        if (response.status === 401) {
          throw new Error(ErrorMessages.INVALID_API_KEY);
        }
        if (response.status === 429) {
          throw new Error(ErrorMessages.RATE_LIMITED);
        }
        if (message.includes('context_length')) {
          throw new Error(ErrorMessages.OPENAI_CONTEXT_LENGTH);
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
    const script = data.choices[0].message.content.trim();

    if (!script || script.length === 0) {
      logger.error('Generated script is empty');
      throw new Error(ErrorMessages.SCRIPT_GENERATION_FAILED);
    }

    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = Math.round(wordCount / 2.5); // ~150 words per minute
    
    logger.info('Script generated successfully', { 
      charCount: script.length, 
      wordCount,
      estimatedDuration,
      tokensUsed: data.usage?.total_tokens 
    });

    return Response.json({ 
      script,
      metadata: {
        wordCount,
        charCount: script.length,
        estimatedDurationSeconds: estimatedDuration,
        tokensUsed: data.usage?.total_tokens
      }
    });

  } catch (error) {
    logger.error('Script generation failed', error);
    
    const userMessage = getUserFriendlyError(error, 'Script generation');
    return Response.json({ 
      error: userMessage,
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
});