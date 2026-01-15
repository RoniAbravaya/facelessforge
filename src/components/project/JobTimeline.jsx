import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, XCircle, Loader2, Info, AlertTriangle, Clock 
} from 'lucide-react';
import { motion } from 'framer-motion';

const eventIcons = {
  step_started: Clock,
  step_progress: Loader2,
  step_finished: CheckCircle2,
  step_failed: XCircle
};

const levelColors = {
  info: 'text-blue-600 bg-blue-50 border-blue-200',
  success: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  warning: 'text-amber-600 bg-amber-50 border-amber-200',
  error: 'text-red-600 bg-red-50 border-red-200'
};

export default function JobTimeline({ events = [] }) {
  if (events.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6 text-center text-slate-500">
          <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p>No events yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="border-b bg-slate-50">
        <CardTitle>Generation Timeline</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {events.map((event, idx) => {
            const Icon = eventIcons[event.event_type] || Info;
            const colorClass = levelColors[event.level] || levelColors.info;
            
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <div className={`p-2 rounded-lg border ${colorClass}`}>
                    <Icon className={`w-4 h-4 ${event.event_type === 'step_progress' ? 'animate-spin' : ''}`} />
                  </div>
                  {idx < events.length - 1 && (
                    <div className="w-0.5 flex-1 bg-slate-200 my-1" />
                  )}
                </div>

                <div className="flex-1 pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-slate-900">{event.message}</p>
                      <p className="text-sm text-slate-600 mt-1">
                        {event.step?.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(event.created_date).toLocaleTimeString()}
                    </span>
                  </div>

                  {event.progress !== null && event.progress !== undefined && (
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-600">Progress</span>
                        <span className="text-xs font-medium text-slate-700">{event.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${event.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {event.data && Object.keys(event.data).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                        View details
                      </summary>
                      <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-700 overflow-auto">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}