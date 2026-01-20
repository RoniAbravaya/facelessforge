import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, ExternalLink, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function PostCard({ post, compact = false, onDelete }) {
  const statusConfig = {
    draft: { icon: Clock, color: 'bg-slate-100 text-slate-700', label: 'Draft' },
    scheduled: { icon: Clock, color: 'bg-blue-100 text-blue-700', label: 'Scheduled' },
    publishing: { icon: Loader2, color: 'bg-amber-100 text-amber-700', label: 'Publishing', spin: true },
    published: { icon: CheckCircle2, color: 'bg-green-100 text-green-700', label: 'Published' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' }
  };

  const config = statusConfig[post.status] || statusConfig.draft;
  const Icon = config.icon;

  if (compact) {
    return (
      <div className={`text-xs p-2 rounded border-l-2 ${
        post.platform === 'tiktok' ? 'border-pink-500 bg-pink-50' : 'border-slate-500 bg-slate-50'
      }`}>
        <div className="font-medium truncate">{post.title}</div>
        <div className="flex items-center gap-1 mt-1">
          <Icon className={`w-3 h-3 ${config.spin ? 'animate-spin' : ''}`} />
          <span className="text-slate-600">{format(new Date(post.scheduled_for), 'HH:mm')}</span>
        </div>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        {post.video_url && (
          <div className="w-16 h-16 bg-slate-100 rounded flex-shrink-0 overflow-hidden">
            <video src={post.video_url} className="w-full h-full object-cover" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h4 className="font-semibold text-slate-900">{post.title}</h4>
              <p className="text-sm text-slate-600 truncate">{(post.caption || '').substring(0, 60)}...</p>
            </div>
            <Badge className={config.color}>
              <Icon className={`w-3 h-3 mr-1 ${config.spin ? 'animate-spin' : ''}`} />
              {config.label}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {format(new Date(post.scheduled_for), 'MMM d, yyyy HH:mm')}
            </div>
            {post.platform && (
              <Badge variant="outline" className="text-xs">
                {post.platform}
              </Badge>
            )}
          </div>

          {post.error_message && (
            <p className="text-sm text-red-600 mt-2">Error: {post.error_message}</p>
          )}

          <div className="flex gap-2 mt-3">
            {post.tiktok_share_url && (
              <a href={post.tiktok_share_url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  View on TikTok
                </Button>
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(post.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}