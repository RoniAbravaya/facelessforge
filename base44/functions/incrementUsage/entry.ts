/**
 * incrementUsage - Track video generation usage after job starts.
 * Called from startVideoGeneration when job transitions to 'running'.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Find today's usage log
    const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ 
      user_email: user.email, 
      date: today 
    });

    if (usageLogs.length === 0) {
      return Response.json({ error: 'Usage log not found' }, { status: 404 });
    }

    const usageLog = usageLogs[0];

    // Increment usage count
    await base44.asServiceRole.entities.UsageLog.update(usageLog.id, {
      videos_generated: usageLog.videos_generated + 1,
    });

    return Response.json({ 
      success: true, 
      videos_generated: usageLog.videos_generated + 1 
    });
  } catch (error) {
    console.error('Error incrementing usage:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});