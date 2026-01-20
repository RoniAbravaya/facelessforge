/**
 * UsageStats component - Displays usage statistics for the current billing period.
 * Shows video generation counts, API usage, and estimated costs.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Video, Clock, TrendingUp, AlertTriangle 
} from 'lucide-react';

// Default quota limits (can be overridden by subscription tier)
const DEFAULT_QUOTAS = {
  videosPerMonth: 10,
  minutesPerMonth: 30,
  apiCallsPerMonth: 500,
};

export default function UsageStats({ 
  projects = [], 
  quotas = DEFAULT_QUOTAS,
  showWarnings = true 
}) {
  // Calculate usage from projects
  const completedProjects = projects.filter(p => p.status === 'completed');
  const totalMinutes = completedProjects.reduce((sum, p) => sum + (p.duration || 0), 0) / 60;
  const generatingProjects = projects.filter(p => p.status === 'generating');
  
  // Calculate percentages
  const videoPercent = Math.min(100, (completedProjects.length / quotas.videosPerMonth) * 100);
  const minutesPercent = Math.min(100, (totalMinutes / quotas.minutesPerMonth) * 100);
  
  // Determine warning states
  const videoWarning = videoPercent >= 80;
  const minutesWarning = minutesPercent >= 80;
  
  const formatMinutes = (minutes) => {
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    return `${minutes.toFixed(1)}m`;
  };

  const stats = [
    {
      label: 'Videos Generated',
      current: completedProjects.length,
      limit: quotas.videosPerMonth,
      percent: videoPercent,
      icon: Video,
      color: videoWarning ? 'text-amber-600' : 'text-blue-600',
      bgColor: videoWarning ? 'bg-amber-50' : 'bg-blue-50',
      warning: videoWarning,
    },
    {
      label: 'Total Duration',
      current: formatMinutes(totalMinutes),
      limit: `${quotas.minutesPerMonth}m`,
      percent: minutesPercent,
      icon: Clock,
      color: minutesWarning ? 'text-amber-600' : 'text-emerald-600',
      bgColor: minutesWarning ? 'bg-amber-50' : 'bg-emerald-50',
      warning: minutesWarning,
    },
    {
      label: 'In Progress',
      current: generatingProjects.length,
      limit: null,
      percent: null,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="border-b bg-slate-50 py-4">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>Usage This Month</span>
          <Badge variant="outline" className="font-normal text-xs">
            Resets in {getDaysUntilReset()} days
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            
            return (
              <div key={stat.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${stat.bgColor}`}>
                      <Icon className={`w-4 h-4 ${stat.color}`} />
                    </div>
                    <span className="text-sm text-slate-700">{stat.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {stat.current}
                      {stat.limit && <span className="text-slate-400"> / {stat.limit}</span>}
                    </span>
                    {stat.warning && showWarnings && (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                </div>
                {stat.percent !== null && (
                  <Progress 
                    value={stat.percent} 
                    className={`h-1.5 ${stat.warning ? '[&>div]:bg-amber-500' : ''}`}
                  />
                )}
              </div>
            );
          })}
        </div>
        
        {(videoWarning || minutesWarning) && showWarnings && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-900">
                  Approaching quota limit
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Consider upgrading your plan for more capacity.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to calculate days until month reset
function getDaysUntilReset() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}
