/**
 * ContentCalendar - Main content scheduling calendar with Month/Week/List views.
 * Allows scheduling posts to multiple platforms with timezone support.
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, 
  Clock, RefreshCw, AlertCircle, CheckCircle2, Loader2,
  List, Grid3X3, Edit, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import PostEditor from '@/components/scheduling/PostEditor';

// Platform configuration
const PLATFORMS = {
  tiktok: { name: 'TikTok', color: 'bg-black text-white', icon: '🎵' },
  instagram: { name: 'Instagram', color: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white', icon: '📸' },
  youtube: { name: 'YouTube', color: 'bg-red-600 text-white', icon: '▶️' },
  twitter: { name: 'X/Twitter', color: 'bg-slate-900 text-white', icon: '𝕏' },
};

// Status configuration
const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700', icon: Edit },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', icon: Clock },
  publishing: { label: 'Publishing', color: 'bg-amber-100 text-amber-700', icon: Loader2, spin: true },
  published: { label: 'Published', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

// Get days in month
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Get first day of month (0 = Sunday)
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

// Format date for display
function formatDate(date, format = 'short') {
  const d = new Date(date);
  if (format === 'time') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (format === 'full') {
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Check if same day
function isSameDay(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getFullYear() === d2.getFullYear() && 
         d1.getMonth() === d2.getMonth() && 
         d1.getDate() === d2.getDate();
}

export default function ContentCalendar() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // month, week, list
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Get user timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Fetch scheduled posts
  const { data: scheduledPosts = [], isLoading } = useQuery({
    queryKey: ['scheduledPosts', currentDate.getFullYear(), currentDate.getMonth()],
    queryFn: async () => {
      // Fetch from ScheduledPost entity
      const posts = await base44.entities.ScheduledPost.list('-scheduled_at', 100);
      return posts;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch completed projects with videos (for quick scheduling)
  const { data: completedProjects = [] } = useQuery({
    queryKey: ['completedProjects'],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ status: 'completed' }, '-created_date', 20);
      return projects;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (postId) => {
      await base44.entities.ScheduledPost.delete(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['scheduledPosts']);
      toast.success('Post deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (postId) => {
      await base44.entities.ScheduledPost.update(postId, {
        status: 'scheduled',
        error_message: null,
        retry_count: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['scheduledPosts']);
      toast.success('Post queued for retry');
    },
  });

  // Filter posts
  const filteredPosts = useMemo(() => {
    return (scheduledPosts || []).filter(post => {
      if (platformFilter !== 'all' && post.platform !== platformFilter) return false;
      if (statusFilter !== 'all' && post.status !== statusFilter) return false;
      return true;
    });
  }, [scheduledPosts, platformFilter, statusFilter]);

  // Get posts for a specific day
  const getPostsForDay = (date) => {
    return filteredPosts.filter(post => isSameDay(post.scheduled_at, date));
  };

  // Navigation
  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Open editor for new post
  const openNewPostEditor = (date = null) => {
    setSelectedPost(null);
    setSelectedDate(date);
    setIsEditorOpen(true);
  };

  // Open editor for existing post
  const openEditPostEditor = (post) => {
    setSelectedPost(post);
    setSelectedDate(null);
    setIsEditorOpen(true);
  };

  // Render month view
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();

    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Add empty cells for days before the first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-32 bg-slate-50/50 border-b border-r border-slate-100" />);
    }

    // Add cells for each day
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayPosts = getPostsForDay(date);
      const isToday = isSameDay(date, today);

      days.push(
        <div
          key={day}
          className={`h-32 border-b border-r border-slate-100 p-1 cursor-pointer hover:bg-slate-50 transition-colors ${
            isToday ? 'bg-blue-50/50' : ''
          }`}
          onClick={() => openNewPostEditor(date)}
        >
          <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
            {day}
          </div>
          <div className="space-y-1 overflow-y-auto max-h-24">
            {dayPosts.slice(0, 3).map((post) => (
              <PostCard 
                key={post.id} 
                post={post} 
                compact 
                onClick={(e) => {
                  e.stopPropagation();
                  openEditPostEditor(post);
                }}
              />
            ))}
            {dayPosts.length > 3 && (
              <div className="text-xs text-slate-500 pl-1">
                +{dayPosts.length - 3} more
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-slate-50">
          {dayNames.map(name => (
            <div key={name} className="py-2 text-center text-sm font-medium text-slate-600 border-b border-r border-slate-200">
              {name}
            </div>
          ))}
        </div>
        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {days}
        </div>
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }

    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 bg-slate-50 border-b border-slate-200">
          <div className="py-2 px-2 text-xs text-slate-500">{timezone}</div>
          {days.map((date) => (
            <div 
              key={date.toISOString()} 
              className={`py-2 text-center border-l border-slate-200 ${
                isSameDay(date, new Date()) ? 'bg-blue-50' : ''
              }`}
            >
              <div className="text-xs text-slate-500">{date.toLocaleDateString([], { weekday: 'short' })}</div>
              <div className={`text-lg font-semibold ${isSameDay(date, new Date()) ? 'text-blue-600' : 'text-slate-900'}`}>
                {date.getDate()}
              </div>
            </div>
          ))}
        </div>
        {/* Time grid */}
        <div className="max-h-[600px] overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-slate-100">
              <div className="py-4 px-2 text-xs text-slate-500 border-r border-slate-100">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {days.map((date) => {
                const hourStart = new Date(date);
                hourStart.setHours(hour, 0, 0, 0);
                const hourEnd = new Date(date);
                hourEnd.setHours(hour + 1, 0, 0, 0);
                
                const hourPosts = filteredPosts.filter(post => {
                  const postDate = new Date(post.scheduled_at);
                  return postDate >= hourStart && postDate < hourEnd;
                });

                return (
                  <div 
                    key={`${date.toISOString()}-${hour}`}
                    className="border-l border-slate-100 p-1 min-h-[60px] hover:bg-slate-50 cursor-pointer"
                    onClick={() => {
                      const newDate = new Date(date);
                      newDate.setHours(hour);
                      openNewPostEditor(newDate);
                    }}
                  >
                    {hourPosts.map((post) => (
                      <PostCard 
                        key={post.id} 
                        post={post} 
                        compact
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditPostEditor(post);
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render list view
  const renderListView = () => {
    const groupedPosts = (filteredPosts || []).reduce((acc, post) => {
      const dateKey = new Date(post.scheduled_at).toDateString();
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(post);
      return acc;
    }, {});

    const sortedDates = Object.keys(groupedPosts).sort((a, b) => new Date(a) - new Date(b));

    return (
      <div className="space-y-6">
        {sortedDates.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-12 pb-12 text-center">
              <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No scheduled posts</h3>
              <p className="text-slate-600 mb-4">Create your first scheduled post to see it here.</p>
              <Button onClick={() => openNewPostEditor()} className="bg-slate-900 hover:bg-slate-800">
                <Plus className="w-4 h-4 mr-2" />
                Schedule Post
              </Button>
            </CardContent>
          </Card>
        ) : (
          sortedDates.map((dateKey) => (
            <div key={dateKey}>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-slate-500" />
                {formatDate(dateKey, 'full')}
                <Badge variant="outline" className="ml-auto">
                  {groupedPosts[dateKey].length} post{groupedPosts[dateKey].length > 1 ? 's' : ''}
                </Badge>
              </h3>
              <div className="space-y-2">
                {groupedPosts[dateKey]
                  .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
                  .map((post) => (
                    <PostCard 
                      key={post.id} 
                      post={post}
                      onEdit={() => openEditPostEditor(post)}
                      onDelete={() => deleteMutation.mutate(post.id)}
                      onRetry={() => retryMutation.mutate(post.id)}
                    />
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">
                Content Calendar
              </h1>
              <p className="text-slate-600">
                Schedule and manage your social media posts • {timezone}
              </p>
            </div>
            <Button 
              onClick={() => openNewPostEditor()}
              className="bg-slate-900 hover:bg-slate-800 shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Schedule Post
            </Button>
          </motion.div>
        </div>

        {/* Controls */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              {/* View Tabs */}
              <Tabs value={view} onValueChange={setView}>
                <TabsList>
                  <TabsTrigger value="month" className="gap-2">
                    <Grid3X3 className="w-4 h-4" />
                    Month
                  </TabsTrigger>
                  <TabsTrigger value="week" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    Week
                  </TabsTrigger>
                  <TabsTrigger value="list" className="gap-2">
                    <List className="w-4 h-4" />
                    List
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={goToPrevMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={goToNextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <span className="text-lg font-semibold text-slate-900 ml-2">
                  {currentDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </span>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {Object.entries(PLATFORMS).map(([key, platform]) => (
                      <SelectItem key={key} value={key}>
                        {platform.icon} {platform.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar View */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {view === 'month' && renderMonthView()}
              {view === 'week' && renderWeekView()}
              {view === 'list' && renderListView()}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Post Editor Dialog */}
        <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedPost ? 'Edit Scheduled Post' : 'Schedule New Post'}
              </DialogTitle>
            </DialogHeader>
            <PostEditor
              post={selectedPost}
              initialDate={selectedDate}
              completedProjects={completedProjects}
              onSave={() => {
                setIsEditorOpen(false);
                queryClient.invalidateQueries(['scheduledPosts']);
              }}
              onCancel={() => setIsEditorOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Post Card Component
function PostCard({ post, compact = false, onClick, onEdit, onDelete, onRetry }) {
  const platform = PLATFORMS[post.platform] || PLATFORMS.tiktok;
  const status = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
  const StatusIcon = status.icon;

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`text-xs p-1.5 rounded cursor-pointer truncate ${platform.color}`}
      >
        <span className="mr-1">{platform.icon}</span>
        {formatDate(post.scheduled_at, 'time')}
      </div>
    );
  }

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Thumbnail */}
          {post.thumbnail_url && (
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
              <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`${platform.color} border-0`}>
                {platform.icon} {platform.name}
              </Badge>
              <Badge className={`${status.color} border`}>
                <StatusIcon className={`w-3 h-3 mr-1 ${status.spin ? 'animate-spin' : ''}`} />
                {status.label}
              </Badge>
              <span className="text-sm text-slate-500 ml-auto">
                <Clock className="w-3 h-3 inline mr-1" />
                {formatDate(post.scheduled_at, 'time')}
              </span>
            </div>
            
            <p className="text-sm text-slate-700 line-clamp-2 mb-2">
              {post.caption || 'No caption'}
            </p>

            {post.status === 'failed' && post.error_message && (
              <p className="text-xs text-red-600 mb-2">
                Error: {post.error_message}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
              {onRetry && post.status === 'failed' && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={onDelete}>
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}