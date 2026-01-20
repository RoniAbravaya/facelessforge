/**
 * InsightSuggestions - Display AI-driven content suggestions based on performance analytics.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Lightbulb, Target } from 'lucide-react';
import { motion } from 'framer-motion';

export default function InsightSuggestions({ onApply }) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ['performanceInsights'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const allInsights = await base44.entities.PerformanceInsight.list('-avg_engagement_score', 20);
      
      return allInsights.filter(insight => {
        const expiresAt = new Date(insight.expires_at);
        return expiresAt > new Date(now);
      });
    },
    refetchInterval: 300000,
  });

  if (isLoading || !insights || insights.length === 0) {
    return null;
  }

  const topInsights = insights.slice(0, 3);

  const getInsightIcon = (type) => {
    switch (type) {
      case 'topic': return Target;
      case 'style': return Lightbulb;
      default: return TrendingUp;
    }
  };

  const getConfidenceColor = (level) => {
    switch (level) {
      case 'high': return 'bg-green-100 text-green-700';
      case 'medium': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          AI-Powered Suggestions
        </CardTitle>
        <p className="text-sm text-slate-600">
          Based on performance data from your published videos
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topInsights.map((insight, idx) => {
            const Icon = getInsightIcon(insight.insight_type);
            
            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900 capitalize">
                        {insight.insight_type.replace('_', ' ')}
                      </span>
                      <Badge variant="outline" className={getConfidenceColor(insight.confidence_level)}>
                        {insight.confidence_level}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700">
                      <strong>{insight.attribute_value}</strong>
                      <span className="text-slate-500 ml-2">
                        {Math.round(insight.avg_engagement_score)}% avg engagement ({insight.sample_size} videos)
                      </span>
                    </p>
                  </div>
                </div>
                {onApply && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApply(insight)}
                    className="ml-2"
                  >
                    Apply
                  </Button>
                )}
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}