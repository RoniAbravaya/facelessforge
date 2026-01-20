/**
 * QuotaWarning - Display quota status and upgrade prompt on project creation.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, Crown, Clock } from 'lucide-react';

export default function QuotaWarning() {
  const { data: quotaStatus } = useQuery({
    queryKey: ['quotaStatus'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('checkUserQuota', {});
      return data;
    },
    refetchInterval: 30000,
  });

  if (!quotaStatus) return null;

  const { can_generate, remaining, plan, should_queue, message } = quotaStatus;

  if (can_generate && remaining > 0) {
    return (
      <Alert className="bg-green-50 border-green-200">
        <AlertCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-900">
          {message}
          {plan === 'free' && (
            <Link to={createPageUrl('Billing')} className="ml-2 underline font-medium">
              Upgrade to Pro for 5 videos/day
            </Link>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (should_queue) {
    return (
      <Alert className="bg-amber-50 border-amber-200">
        <Clock className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-900">
          <strong>Daily quota reached.</strong> This video will be queued and processed tomorrow automatically.
          {plan === 'free' && (
            <div className="mt-2">
              <Link to={createPageUrl('Billing')}>
                <Button size="sm" variant="outline" className="border-amber-600 text-amber-900 hover:bg-amber-100">
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Pro (5 videos/day)
                </Button>
              </Link>
            </div>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}