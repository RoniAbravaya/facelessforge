/**
 * processQueuedJobs - Daily automation to process queued video jobs at quota reset.
 * Runs at 00:00 UTC, processes all queued jobs respecting new daily limits.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const PLAN_LIMITS = {
  free: 1,
  paid: 5,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const queuedJobs = await base44.asServiceRole.entities.Job.filter({ status: 'queued' }, 'created_date');

    if (queuedJobs.length === 0) {
      console.log('No queued jobs to process');
      return Response.json({ processed: 0, message: 'No queued jobs' });
    }

    const today = new Date().toISOString().split('T')[0];
    const processedJobs = [];

    for (const job of queuedJobs) {
      try {
        const project = await base44.asServiceRole.entities.Project.get(job.project_id);
        const userEmail = project.created_by;

        const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ 
          user_email: userEmail 
        });
        const subscription = subscriptions[0];

        if (!subscription) {
          console.error(`No subscription found for user ${userEmail}, skipping job ${job.id}`);
          continue;
        }

        const quotaLimit = PLAN_LIMITS[subscription.plan] || 1;

        let usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ 
          user_email: userEmail, 
          date: today 
        });
        let usageLog = usageLogs[0];

        if (!usageLog) {
          usageLog = await base44.asServiceRole.entities.UsageLog.create({
            user_email: userEmail,
            date: today,
            videos_generated: 0,
            quota_limit: quotaLimit,
            last_reset_at: new Date().toISOString(),
          });
        }

        if (usageLog.videos_generated < quotaLimit) {
          await base44.asServiceRole.entities.Job.update(job.id, {
            status: 'pending',
            queued_reason: null,
          });

          await base44.asServiceRole.entities.Project.update(project.id, {
            status: 'generating',
          });

          await base44.asServiceRole.entities.UsageLog.update(usageLog.id, {
            videos_generated: usageLog.videos_generated + 1,
          });

          await base44.asServiceRole.functions.invoke('startVideoGeneration', {
            project_id: project.id,
            job_id: job.id,
          });

          processedJobs.push(job.id);
          console.log(`Started queued job ${job.id} for user ${userEmail}`);
        } else {
          console.log(`User ${userEmail} quota exceeded, keeping job ${job.id} queued`);
        }
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
      }
    }

    return Response.json({ 
      processed: processedJobs.length, 
      total_queued: queuedJobs.length,
      processed_job_ids: processedJobs,
    });
  } catch (error) {
    console.error('Error processing queued jobs:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});