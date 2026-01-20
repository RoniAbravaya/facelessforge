import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Calendar as CalendarIcon, List, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import CalendarMonthView from '../components/calendar/CalendarMonthView';
import CalendarWeekView from '../components/calendar/CalendarWeekView';
import PostListView from '../components/calendar/PostListView';

export default function ContentCalendar() {
  const [view, setView] = useState('month'); // month, week, list
  const [selectedDate, setSelectedDate] = useState(new Date());
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['scheduledPosts'],
    queryFn: () => base44.entities.ScheduledPost.list('-scheduled_for', 100),
    refetchInterval: 10000
  });

  const deleteMutation = useMutation({
    mutationFn: (postId) => base44.entities.ScheduledPost.delete(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledPosts'] });
    }
  });

  const statusCounts = posts.reduce((acc, post) => {
    acc[post.status] = (acc[post.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">Content Calendar</h1>
            <p className="text-slate-600 mt-2">Schedule and manage your social media posts</p>
          </div>
          <Link to={createPageUrl('CreatePost')}>
            <Button className="bg-slate-900 hover:bg-slate-800">
              <Plus className="w-4 h-4 mr-2" />
              New Post
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Total Posts</p>
              <p className="text-2xl font-bold text-slate-900">{posts.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Scheduled</p>
              <p className="text-2xl font-bold text-blue-600">{statusCounts.scheduled || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Published</p>
              <p className="text-2xl font-bold text-green-600">{statusCounts.published || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Failed</p>
              <p className="text-2xl font-bold text-red-600">{statusCounts.failed || 0}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Drafts</p>
              <p className="text-2xl font-bold text-slate-600">{statusCounts.draft || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Calendar Views */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                Schedule
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant={view === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('month')}
                >
                  <Grid3x3 className="w-4 h-4 mr-2" />
                  Month
                </Button>
                <Button
                  variant={view === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('week')}
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Week
                </Button>
                <Button
                  variant={view === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setView('list')}
                >
                  <List className="w-4 h-4 mr-2" />
                  List
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {view === 'month' && (
              <CalendarMonthView
                posts={posts}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onDeletePost={(id) => deleteMutation.mutate(id)}
              />
            )}
            {view === 'week' && (
              <CalendarWeekView
                posts={posts}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onDeletePost={(id) => deleteMutation.mutate(id)}
              />
            )}
            {view === 'list' && (
              <PostListView
                posts={posts}
                onDeletePost={(id) => deleteMutation.mutate(id)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}