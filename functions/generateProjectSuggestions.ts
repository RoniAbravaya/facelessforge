import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { excludeSuggestions = [] } = await req.json();

    // Fetch TikTok analytics
    let analyticsData = null;
    let topVideos = [];
    let avgEngagement = 0;

    try {
      const analyticsResult = await base44.functions.invoke('fetchTikTokAnalytics', {});
      analyticsData = analyticsResult.data;

      if (analyticsData?.videos?.length > 0) {
        // Calculate engagement metrics
        const videosWithEngagement = analyticsData.videos.map(v => ({
          ...v,
          engagementRate: v.view_count > 0 
            ? ((v.like_count + v.comment_count + v.share_count) / v.view_count) * 100 
            : 0,
          engagementScore: (v.like_count || 0) + (v.comment_count || 0) * 2 + (v.share_count || 0) * 3
        }));

        // Sort by engagement score
        topVideos = [...videosWithEngagement]
          .sort((a, b) => b.engagementScore - a.engagementScore)
          .slice(0, 5);

        avgEngagement = videosWithEngagement.reduce((sum, v) => sum + v.engagementRate, 0) / videosWithEngagement.length;
      }
    } catch (analyticsError) {
      console.log('[Suggestions] No TikTok analytics available:', analyticsError.message);
    }

    // Get trending topics from LLM
    let trendingTopics = '';
    try {
      const trendingResult = await base44.integrations.Core.InvokeLLM({
        prompt: 'List 5 trending topics on TikTok right now in 2026. Be specific and mention what makes each trend engaging. Keep it concise, 2-3 sentences per topic.',
        add_context_from_internet: true
      });
      trendingTopics = trendingResult;
    } catch (trendError) {
      console.log('[Suggestions] Could not fetch trending topics:', trendError.message);
      trendingTopics = 'Focus on educational content, storytelling, and viral challenges.';
    }

    // Build context for suggestion generation
    let pastPerformanceContext = '';
    if (topVideos.length > 0) {
      pastPerformanceContext = `\n\nYour past high-performing videos:\n`;
      topVideos.forEach((video, idx) => {
        const title = video.title || video.video_description || 'Untitled';
        pastPerformanceContext += `${idx + 1}. "${title.substring(0, 100)}" - ${video.view_count.toLocaleString()} views, ${video.engagementRate.toFixed(2)}% engagement rate, score: ${video.engagementScore}\n`;
      });
      pastPerformanceContext += `\nAverage engagement rate: ${avgEngagement.toFixed(2)}%`;
    } else {
      pastPerformanceContext = '\n\nThis is your first video, so focus on proven viral formats and trending topics.';
    }

    // Build exclusion context
    let exclusionContext = '';
    if (excludeSuggestions.length > 0) {
      exclusionContext = `\n\nIMPORTANT: Do NOT suggest any of these previously generated ideas:\n${excludeSuggestions.map((s, i) => `${i + 1}. Topic: "${s.topic}", Title: "${s.title}"`).join('\n')}\n\nGenerate completely NEW and DIFFERENT ideas.`;
    }

    // Generate suggestions with LLM
    const prompt = `You are an AI assistant helping a content creator plan a new TikTok video.

CURRENT TRENDS:
${trendingTopics}
${pastPerformanceContext}${exclusionContext}

Based on what made past videos successful (tone, structure, emotional triggers) and current TikTok trends, suggest ONE fresh video concept.

Provide EXACTLY this JSON format:
{
  "topic": "A detailed description of what the video should be about (100-150 words)",
  "title": "A catchy, attention-grabbing title (under 60 characters)",
  "style": "Visual style and mood (e.g., 'cinematic with neon accents', 'minimalist and clean')",
  "reasoning": "Why this idea will perform well (2-3 sentences)"
}

Make it unique, engaging, and based on proven viral patterns. Focus on hooks, emotional resonance, and shareability.`;

    const suggestionResult = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          title: { type: 'string' },
          style: { type: 'string' },
          reasoning: { type: 'string' }
        },
        required: ['topic', 'title', 'style', 'reasoning']
      }
    });

    // Store suggestion in user metadata to track what we've suggested
    const existingSuggestions = user.suggested_projects || [];
    const newSuggestion = {
      ...suggestionResult,
      timestamp: new Date().toISOString()
    };
    
    await base44.auth.updateMe({
      suggested_projects: [...existingSuggestions.slice(-19), newSuggestion] // Keep last 20
    });

    return Response.json({
      success: true,
      suggestion: suggestionResult,
      hasAnalytics: topVideos.length > 0,
      topPerformers: topVideos.length,
      avgEngagement: avgEngagement.toFixed(2)
    });

  } catch (error) {
    console.error('[Suggestions] Error:', error);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
});