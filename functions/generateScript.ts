import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { apiKey, topic, duration, language, style } = await req.json();

    console.log('Generating script...');
    console.log(`Topic: ${topic}, Duration: ${duration}s, Language: ${language}`);

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
      console.error(`OpenAI API error (${response.status}):`, errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(`OpenAI API error: ${error.error?.message || errorText}`);
      } catch {
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }
    }

    const data = await response.json();
    const script = data.choices[0].message.content.trim();

    if (!script || script.length === 0) {
      throw new Error('Generated script is empty');
    }

    console.log(`Script generated successfully (${script.length} chars)`);

    return Response.json({ script });

  } catch (error) {
    console.error('Generate script error:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});