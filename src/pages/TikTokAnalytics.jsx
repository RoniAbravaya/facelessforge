import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Users, Heart, Eye, MessageCircle, Share2, Video as VideoIcon, AlertCircle } from 'lucide-react';

export default function TikTokAnalytics() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tiktok-analytics'],
    queryFn: async () => {
      const result = await base44.functions.invoke('fetchTikTokAnalytics', {});
      return result.data;
    },
    refetchInterval: 300000 // Refetch every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid gap-6 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900">Failed to load TikTok analytics</p>
                  <p className="text-sm text-red-700 mt-1">{error.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { userInfo = {}, videos = [] } = data || {};

  // Calculate totals from videos
  const totalViews = videos.reduce((sum, v) => sum + (v.view_count || 0), 0);
  const totalLikes = videos.reduce((sum, v) => sum + (v.like_count || 0), 0);
  const totalComments = videos.reduce((sum, v) => sum + (v.comment_count || 0), 0);
  const totalShares = videos.reduce((sum, v) => sum + (v.share_count || 0), 0);

  const stats = [
    { label: 'Followers', value: userInfo.follower_count || 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Videos', value: userInfo.video_count || videos.length, icon: VideoIcon, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Total Likes', value: userInfo.likes_count || totalLikes, icon: Heart, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Total Views', value: totalViews, icon: Eye, color: 'text-green-600', bg: 'bg-green-50' }
  ];

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Avatar className="w-16 h-16">
            <AvatarImage src={userInfo.avatar_url} />
            <AvatarFallback>{userInfo.display_name?.[0] || 'T'}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">TikTok Analytics</h1>
            <p className="text-slate-600">{userInfo.display_name || 'Your Account'}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 font-medium">{stat.label}</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">
                        {formatNumber(stat.value)}
                      </p>
                    </div>
                    <div className={`${stat.bg} p-3 rounded-lg`}>
                      <Icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Videos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Recent Videos Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {videos.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No videos found</p>
            ) : (
              <div className="space-y-4">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="flex gap-4 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-24 h-24 bg-slate-100 rounded-lg overflow-hidden">
                      {video.cover_image_url ? (
                        <img 
                          src={video.cover_image_url} 
                          alt={video.title || 'Video'} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <VideoIcon className="w-8 h-8 text-slate-400" />
                        </div>
                      )}
                    </div>

                    {/* Video Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {video.title || video.video_description || 'Untitled Video'}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        {formatDate(video.create_time)} • {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                      </p>
                      
                      {/* Stats */}
                      <div className="flex gap-4 mt-3">
                        <div className="flex items-center gap-1 text-sm">
                          <Eye className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-700">{formatNumber(video.view_count || 0)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Heart className="w-4 h-4 text-red-500" />
                          <span className="text-slate-700">{formatNumber(video.like_count || 0)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <MessageCircle className="w-4 h-4 text-blue-500" />
                          <span className="text-slate-700">{formatNumber(video.comment_count || 0)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Share2 className="w-4 h-4 text-green-500" />
                          <span className="text-slate-700">{formatNumber(video.share_count || 0)}</span>
                        </div>
                      </div>

                      {video.share_url && (
                        <a 
                          href={video.share_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                        >
                          View on TikTok →
                        </a>
                      )}
                    </div>

                    {/* Engagement Badge */}
                    <div className="flex-shrink-0">
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {video.view_count > 0 
                          ? `${((video.like_count / video.view_count) * 100).toFixed(1)}% engagement`
                          : 'No views'
                        }
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}