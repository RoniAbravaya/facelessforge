/**
 * createCheckoutSession - Create Stripe checkout session for paid subscription upgrade.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.4.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
    const priceId = Deno.env.get('STRIPE_PRICE_ID_PAID');

    if (!priceId) {
      return Response.json({ error: 'Stripe price ID not configured' }, { status: 500 });
    }

    // Get or create subscription record
    const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ 
      user_email: user.email 
    });
    let subscription = subscriptions[0];

    if (!subscription) {
      subscription = await base44.asServiceRole.entities.Subscription.create({
        user_email: user.email,
        plan: 'free',
        status: 'active',
      });
    }

    // Create or get Stripe customer
    let customerId = subscription.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_email: user.email,
          subscription_id: subscription.id,
        },
      });
      customerId = customer.id;

      await base44.asServiceRole.entities.Subscription.update(subscription.id, {
        stripe_customer_id: customerId,
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/Billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/Billing`,
      metadata: {
        user_email: user.email,
        subscription_id: subscription.id,
      },
    });

    return Response.json({ 
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});