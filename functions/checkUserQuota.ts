/**
 * checkUserQuota - Verify if user can generate a video based on subscription and daily usage.
 * Returns quota status and instructions for job creation.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const PLAN_LIMITS = {
  free: 1,
  paid: 5,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Get or create subscription
    let subscriptions = await base44.asServiceRole.entities.Subscription.filter({ user_email: user.email });
    let subscription = subscriptions[0];

    if (!subscription) {
      subscription = await base44.asServiceRole.entities.Subscription.create({
        user_email: user.email,
        plan: 'free',
        status: 'active',
      });
    }

    const quotaLimit = PLAN_LIMITS[subscription.plan] || 1;

    // Get or create usage log for today
    let usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ 
      user_email: user.email, 
      date: today 
    });
    let usageLog = usageLogs[0];

    if (!usageLog) {
      usageLog = await base44.asServiceRole.entities.UsageLog.create({
        user_email: user.email,
        date: today,
        videos_generated: 0,
        quota_limit: quotaLimit,
        last_reset_at: new Date().toISOString(),
      });
    }

    const canGenerate = usageLog.videos_generated < quotaLimit;
    const remaining = Math.max(0, quotaLimit - usageLog.videos_generated);

    return Response.json({
      can_generate: canGenerate,
      quota_limit: quotaLimit,
      videos_generated: usageLog.videos_generated,
      remaining,
      plan: subscription.plan,
      should_queue: !canGenerate,
      message: canGenerate 
        ? `You have ${remaining} video${remaining !== 1 ? 's' : ''} remaining today`
        : 'Daily quota reached. This video will be queued for tomorrow.',
    });
  } catch (error) {
    console.error('Error checking quota:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});