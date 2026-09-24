/**
 * handleStripeWebhook - Process Stripe subscription lifecycle events.
 * Handles checkout completion, subscription updates, payment failures, and cancellations.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.4.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!signature || !webhookSecret) {
      return Response.json({ error: 'Missing webhook signature or secret' }, { status: 400 });
    }

    const body = await req.text();
    
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return Response.json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    console.log('Received Stripe event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userEmail = session.metadata.user_email;
        const subscriptionId = session.metadata.subscription_id;

        if (!userEmail || !subscriptionId) {
          console.error('Missing metadata in checkout session');
          break;
        }

        const stripeSubscriptionId = session.subscription;

        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

        await base44.asServiceRole.entities.Subscription.update(subscriptionId, {
          plan: 'paid',
          status: 'active',
          stripe_subscription_id: stripeSubscriptionId,
          current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: false,
        });

        console.log(`Upgraded user ${userEmail} to paid plan`);
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSubscription = event.data.object;
        const customerId = stripeSubscription.customer;

        const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
          stripe_customer_id: customerId,
        });

        if (subscriptions.length === 0) {
          console.error('Subscription not found for customer:', customerId);
          break;
        }

        const subscription = subscriptions[0];

        await base44.asServiceRole.entities.Subscription.update(subscription.id, {
          current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: stripeSubscription.cancel_at_period_end,
          status: stripeSubscription.status === 'active' ? 'active' : 'past_due',
        });

        console.log(`Updated subscription for user ${subscription.user_email}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
          stripe_customer_id: customerId,
        });

        if (subscriptions.length === 0) {
          console.error('Subscription not found for customer:', customerId);
          break;
        }

        const subscription = subscriptions[0];

        await base44.asServiceRole.entities.Subscription.update(subscription.id, {
          plan: 'free',
          status: 'cancelled',
          stripe_subscription_id: null,
        });

        console.log(`Downgraded user ${subscription.user_email} to free plan due to payment failure`);
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object;
        const customerId = stripeSubscription.customer;

        const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
          stripe_customer_id: customerId,
        });

        if (subscriptions.length === 0) {
          console.error('Subscription not found for customer:', customerId);
          break;
        }

        const subscription = subscriptions[0];

        await base44.asServiceRole.entities.Subscription.update(subscription.id, {
          plan: 'free',
          status: 'cancelled',
          stripe_subscription_id: null,
        });

        console.log(`Cancelled subscription for user ${subscription.user_email}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});