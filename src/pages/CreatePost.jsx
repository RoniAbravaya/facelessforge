import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Send, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { toast } from 'sonner';
import TikTokPreview from '../components/post/TikTokPreview';

export default function CreatePost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    title: '',
    caption: '',
    hashtags: '',
    video_url: '',
    scheduled_for: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    privacy_level: 'PUBLIC_TO_EVERYONE',
    publish_mode: 'post_now',
    linked_project_id: ''
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['completedProjects'],
    queryFn: async () => {
      const all = await base44.entities.Project.filter({ status: 'completed' }, '-created_date', 50);
      return all;
    }
  });

  const { data: artifacts = [] } = useQuery({
    queryKey: ['projectArtifacts', formData.linked_project_id],
    queryFn: () => base44.entities.Artifact.filter({ 
      project_id: formData.linked_project_id,
      artifact_type: 'final_video'
    }),
    enabled: !!formData.linked_project_id
  });

  const createMutation = useMutation({
    mutationFn: async (status) => {
      const postData = {
        ...formData,
        status,
        scheduled_for: formData.scheduled_for || new Date().toISOString()
      };
      
      const post = await base44.entities.ScheduledPost.create(postData);
      
      // Log audit event
      await base44.entities.PublishAuditLog.create({
        post_id: post.id,
        action: status === 'scheduled' ? 'scheduled' : 'created',
        actor_email: (await base44.auth.me()).email,
        timestamp: new Date().toISOString()
      });

      // If scheduled and time is now/past, trigger immediate publish
      if (status === 'scheduled' && new Date(postData.scheduled_for) <= new Date()) {
        await base44.functions.invoke('publishScheduledPost', { postId: post.id });
      }

      return post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledPosts'] });
      toast.success('Post created successfully');
      navigate(createPageUrl('ContentCalendar'));
    },
    onError: (error) => {
      toast.error(`Failed to create post: ${error.message}`);
    }
  });

  const handleProjectSelect = (projectId) => {
    setFormData(prev => ({ ...prev, linked_project_id: projectId }));
    
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setFormData(prev => ({
        ...prev,
        title: prev.title || project.title,
        caption: prev.caption || project.topic
      }));
    }
  };

  React.useEffect(() => {
    if (artifacts.length > 0) {
      setFormData(prev => ({ ...prev, video_url: artifacts[0].file_url }));
    }
  }, [artifacts]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link to={createPageUrl('ContentCalendar')}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Calendar
          </Button>
        </Link>

        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-8">Create Post</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Editor */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="border-b">
              <CardTitle>Post Details</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label>Title (Internal)</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="My awesome TikTok"
                />
              </div>

              <div>
                <Label>Link to Generated Project (Optional)</Label>
                <Select value={formData.linked_project_id} onValueChange={handleProjectSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} ({new Date(p.created_date).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Video URL</Label>
                <Input
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div>
                <Label>Caption</Label>
                <Textarea
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  placeholder="Write your caption..."
                  rows={4}
                  maxLength={2200}
                />
                <p className="text-xs text-slate-500 mt-1">{formData.caption.length}/2200</p>
              </div>

              <div>
                <Label>Hashtags</Label>
                <Input
                  value={formData.hashtags}
                  onChange={(e) => setFormData({ ...formData, hashtags: e.target.value })}
                  placeholder="#marketing #business #success"
                />
              </div>

              <div>
                <Label>Schedule For</Label>
                <Input
                  type="datetime-local"
                  value={formData.scheduled_for}
                  onChange={(e) => setFormData({ ...formData, scheduled_for: e.target.value })}
                />
                <p className="text-xs text-slate-500 mt-1">Leave empty to publish immediately</p>
              </div>

              <div>
                <Label>Privacy</Label>
                <Select value={formData.privacy_level} onValueChange={(v) => setFormData({ ...formData, privacy_level: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC_TO_EVERYONE">Public</SelectItem>
                    <SelectItem value="MUTUAL_FOLLOW_FRIENDS">Friends</SelectItem>
                    <SelectItem value="SELF_ONLY">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => createMutation.mutate('draft')}
                  disabled={createMutation.isPending}
                  variant="outline"
                  className="flex-1"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Draft
                </Button>
                <Button
                  onClick={() => createMutation.mutate('scheduled')}
                  disabled={createMutation.isPending || !formData.title || !formData.caption || !formData.video_url}
                  className="flex-1 bg-slate-900"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Schedule Post
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <TikTokPreview
            caption={formData.caption}
            hashtags={formData.hashtags}
            videoUrl={formData.video_url}
          />
        </div>
      </div>
    </div>
  );
}