/**
 * Billing - Subscription management page with plan comparison and Stripe checkout.
 */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, Zap, Crown, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const PLANS = {
  free: {
    name: 'Free',
    price: '$0',
    period: 'forever',
    videos: 1,
    features: ['1 video generation per day', 'All AI providers', 'TikTok publishing', 'Basic analytics'],
    icon: Video,
    color: 'text-slate-600',
  },
  paid: {
    name: 'Pro',
    price: '$29',
    period: 'month',
    videos: 5,
    features: ['5 video generations per day', 'All AI providers', 'Multi-platform publishing', 'Advanced analytics', 'Priority support'],
    icon: Crown,
    color: 'text-amber-600',
  },
};

export default function Billing() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('checkUserQuota', {});
      return { plan: data.plan, quota_limit: data.quota_limit };
    },
    enabled: !!user,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('createCheckoutSession', {});
      return data;
    },
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
    onError: (error) => {
      toast.error(`Checkout failed: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const currentPlan = subscription?.plan || 'free';
  const isPaid = currentPlan === 'paid';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Choose Your Plan</h1>
          <p className="text-lg text-slate-600">
            Unlock more video generations and advanced features
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {Object.entries(PLANS).map(([key, plan]) => {
            const Icon = plan.icon;
            const isCurrentPlan = currentPlan === key;
            const canUpgrade = key === 'paid' && currentPlan === 'free';

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: key === 'paid' ? 0.1 : 0 }}
              >
                <Card className={`relative border-2 ${isCurrentPlan ? 'border-blue-500 shadow-lg' : 'border-slate-200'}`}>
                  {isCurrentPlan && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600">
                      Current Plan
                    </Badge>
                  )}
                  
                  <CardHeader className="text-center pb-6">
                    <div className={`w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4`}>
                      <Icon className={`w-8 h-8 ${plan.color}`} />
                    </div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>
                      <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                      <span className="text-slate-600">/{plan.period}</span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    <div className="mb-6">
                      <div className="text-center mb-4">
                        <div className="text-3xl font-bold text-slate-900">{plan.videos}</div>
                        <div className="text-sm text-slate-600">videos per day</div>
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-slate-700">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="w-full"
                      variant={canUpgrade ? 'default' : 'outline'}
                      disabled={isCurrentPlan || checkoutMutation.isPending}
                      onClick={() => canUpgrade && checkoutMutation.mutate()}
                    >
                      {checkoutMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrentPlan ? (
                        'Current Plan'
                      ) : canUpgrade ? (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Upgrade to Pro
                        </>
                      ) : (
                        'Contact Support'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Subscription Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-slate-600 mb-1">Current Plan</div>
                <div className="text-lg font-semibold text-slate-900">
                  {PLANS[currentPlan]?.name || 'Free'}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Daily Limit</div>
                <div className="text-lg font-semibold text-slate-900">
                  {subscription?.quota_limit || 1} videos per day
                </div>
              </div>
            </div>

            {!isPaid && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-900">
                  <strong>Soft Limits:</strong> If you exceed your daily limit, videos will be queued and processed the next day automatically.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}