/**
 * PostEditor - Create and edit scheduled social media posts.
 * Supports platform-specific validation and preview.
 */
import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, Video, AlertCircle, CheckCircle2, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

// Platform configurations with validation rules
const PLATFORM_CONFIG = {
  tiktok: {
    name: 'TikTok',
    icon: '🎵',
    color: 'bg-black text-white',
    maxCaption: 2200,
    maxHashtags: 30,
    aspectRatios: ['9:16', '1:1'],
    maxDuration: 600, // 10 minutes
    minDuration: 3,
    features: ['caption', 'hashtags', 'video'],
  },
  instagram: {
    name: 'Instagram',
    icon: '📸',
    color: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
    maxCaption: 2200,
    maxHashtags: 30,
    aspectRatios: ['9:16', '1:1', '4:5'],
    maxDuration: 90, // Reels
    minDuration: 3,
    features: ['caption', 'hashtags', 'video', 'location'],
  },
  youtube: {
    name: 'YouTube',
    icon: '▶️',
    color: 'bg-red-600 text-white',
    maxCaption: 5000, // Description
    maxHashtags: 15,
    aspectRatios: ['16:9', '9:16'],
    maxDuration: 43200, // 12 hours
    minDuration: 1,
    features: ['title', 'caption', 'hashtags', 'video', 'tags'],
  },
  twitter: {
    name: 'X/Twitter',
    icon: '𝕏',
    color: 'bg-slate-900 text-white',
    maxCaption: 280,
    maxHashtags: 10,
    aspectRatios: ['16:9', '1:1'],
    maxDuration: 140,
    minDuration: 0.5,
    features: ['caption', 'hashtags', 'video'],
  },
};

// Extract hashtags from text
function extractHashtags(text) {
  const matches = text.match(/#\w+/g) || [];
  return matches.map(tag => tag.toLowerCase());
}

// Validate post against platform rules
function validatePost(post, platform) {
  const config = PLATFORM_CONFIG[platform];
  const errors = [];
  const warnings = [];

  if (!config) {
    errors.push('Invalid platform selected');
    return { errors, warnings, isValid: false, hashtags: [], charCount: 0, maxChars: 2200 };
  }

  // Caption length
  if (post.caption && post.caption.length > config.maxCaption) {
    errors.push(`Caption exceeds ${config.maxCaption} characters (${post.caption.length})`);
  }

  // Hashtag count
  const hashtags = extractHashtags(post.caption || '');
  if (hashtags.length > config.maxHashtags) {
    warnings.push(`Too many hashtags (${hashtags.length}/${config.maxHashtags})`);
  }

  // Video required
  if (!post.video_url) {
    errors.push('Video is required');
  }

  // Title required
  if (!post.title || post.title.trim() === '') {
    errors.push('Title is required');
  }

  // Scheduled time
  if (!post.scheduled_for) {
    errors.push('Scheduled time is required');
  } else {
    const scheduledTime = new Date(post.scheduled_for);
    if (scheduledTime <= new Date()) {
      errors.push('Scheduled time must be in the future');
    }
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
    hashtags,
    charCount: (post.caption || '').length,
    maxChars: config.maxCaption,
  };
}

export default function PostEditor({ post, initialDate, completedProjects = [], onSave, onCancel }) {
  const [formData, setFormData] = useState({
    platform: 'tiktok',
    title: '',
    caption: '',
    video_url: '',
    thumbnail_url: '',
    scheduled_for: '',
    privacy_level: 'PUBLIC_TO_EVERYONE',
    project_id: '',
    ...post,
  });

  const [validation, setValidation] = useState({ errors: [], warnings: [], isValid: false, hashtags: [], charCount: 0, maxChars: 2200 });
  const [activeTab, setActiveTab] = useState('content');

  // Initialize scheduled_for from initialDate
  useEffect(() => {
    if (initialDate && !post) {
      const date = new Date(initialDate);
      // Set to next hour if time not specified
      if (date.getHours() === 0 && date.getMinutes() === 0) {
        date.setHours(new Date().getHours() + 1);
        date.setMinutes(0);
      }
      setFormData(prev => ({
        ...prev,
        scheduled_for: date.toISOString().slice(0, 16),
      }));
    }
  }, [initialDate, post]);

  // Validate on change
  useEffect(() => {
    const result = validatePost(formData, formData.platform);
    setValidation(result);
  }, [formData]);

  // Get config for current platform (fallback to tiktok if invalid)
  const platformConfig = PLATFORM_CONFIG[formData.platform] || PLATFORM_CONFIG.tiktok;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        status: 'scheduled',
        scheduled_for: new Date(data.scheduled_for).toISOString(),
      };

      if (post?.id) {
        return await base44.entities.ScheduledPost.update(post.id, payload);
      } else {
        return await base44.entities.ScheduledPost.create(payload);
      }
    },
    onSuccess: () => {
      toast.success(post ? 'Post updated' : 'Post scheduled');
      onSave?.();
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Handle project selection (auto-fill video)
  const handleProjectSelect = (projectId) => {
    const project = completedProjects.find(p => p.id === projectId);
    if (project) {
      // Fetch the final video artifact
      base44.entities.Artifact.filter({ 
        project_id: projectId, 
        artifact_type: 'final_video' 
      }).then(artifacts => {
        if (artifacts[0]?.file_url) {
          setFormData(prev => ({
            ...prev,
            project_id: projectId,
            video_url: artifacts[0].file_url,
            title: prev.title || project.title || project.topic,
            caption: prev.caption || project.tiktok_settings?.caption || project.topic,
          }));
          toast.success('Video loaded from project');
        }
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validation.isValid) {
      toast.error('Please fix validation errors');
      return;
    }
    saveMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Platform Selection */}
      <div>
        <Label className="text-sm font-medium">Platform</Label>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, platform: key }))}
              className={`p-3 rounded-lg border-2 transition-all ${
                formData.platform === key
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-xl mb-1">{config.icon}</div>
              <div className="text-xs font-medium">{config.name}</div>
            </button>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="content" className="flex-1">Content</TabsTrigger>
          <TabsTrigger value="schedule" className="flex-1">Schedule</TabsTrigger>
          <TabsTrigger value="preview" className="flex-1">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Enter post title..."
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="mt-2"
            />
          </div>

          {/* Video Selection */}
          <div>
            <Label htmlFor="video">Video Source</Label>
            <div className="mt-2 space-y-2">
              {completedProjects.length > 0 && (
                <Select
                  value={formData.project_id}
                  onValueChange={handleProjectSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select from completed projects..." />
                  </SelectTrigger>
                  <SelectContent>
                    {completedProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <Video className="w-4 h-4" />
                          {project.title} ({project.duration}s)
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="text-xs text-slate-500 text-center">or</div>
              <Input
                id="video"
                placeholder="Enter video URL..."
                value={formData.video_url}
                onChange={(e) => setFormData(prev => ({ ...prev, video_url: e.target.value }))}
              />
            </div>
            {formData.video_url && (
              <div className="mt-2 rounded-lg overflow-hidden bg-black">
                <video src={formData.video_url} controls className="w-full max-h-48" />
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="caption">Caption</Label>
              <span className={`text-xs ${
                (validation.charCount || 0) > platformConfig.maxCaption ? 'text-red-600' : 'text-slate-500'
              }`}>
                {validation.charCount || 0}/{platformConfig.maxCaption}
              </span>
            </div>
            <Textarea
              id="caption"
              placeholder="Write your caption..."
              value={formData.caption}
              onChange={(e) => setFormData(prev => ({ ...prev, caption: e.target.value }))}
              className="min-h-[120px]"
              maxLength={platformConfig.maxCaption + 100} // Allow slight overflow for editing
            />
            {validation.hashtags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {validation.hashtags.slice(0, 10).map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {validation.hashtags.length > 10 && (
                  <Badge variant="outline" className="text-xs">
                    +{validation.hashtags.length - 10} more
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Privacy */}
          <div>
            <Label>Privacy Level</Label>
            <Select
              value={formData.privacy_level}
              onValueChange={(value) => setFormData(prev => ({ ...prev, privacy_level: value }))}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC_TO_EVERYONE">Public</SelectItem>
                <SelectItem value="MUTUAL_FOLLOW_FRIENDS">Friends Only</SelectItem>
                <SelectItem value="SELF_ONLY">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          {/* Date/Time Picker */}
          <div>
            <Label htmlFor="scheduled_for">Schedule Date & Time *</Label>
            <Input
              id="scheduled_for"
              type="datetime-local"
              value={formData.scheduled_for}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduled_for: e.target.value }))}
              className="mt-2"
              min={new Date().toISOString().slice(0, 16)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
          </div>

          {/* Quick Schedule Options */}
          <div>
            <Label>Quick Schedule</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { label: 'In 1 hour', hours: 1 },
                { label: 'Tomorrow 9AM', hours: 'tomorrow9' },
                { label: 'Tomorrow 6PM', hours: 'tomorrow18' },
              ].map((option) => (
                <Button
                  key={option.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    let date = new Date();
                    if (option.hours === 'tomorrow9') {
                      date.setDate(date.getDate() + 1);
                      date.setHours(9, 0, 0, 0);
                    } else if (option.hours === 'tomorrow18') {
                      date.setDate(date.getDate() + 1);
                      date.setHours(18, 0, 0, 0);
                    } else {
                      date.setHours(date.getHours() + option.hours);
                    }
                    setFormData(prev => ({
                      ...prev,
                      scheduled_for: date.toISOString().slice(0, 16),
                    }));
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Badge className={`${platformConfig.color} border-0`}>
                  {platformConfig.icon} {platformConfig.name}
                </Badge>
                <span className="text-sm text-slate-500">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  {formData.scheduled_for 
                    ? new Date(formData.scheduled_for).toLocaleString() 
                    : 'Not scheduled'}
                </span>
              </div>

              {formData.title && (
                <h3 className="font-semibold text-slate-900 mb-2">{formData.title}</h3>
              )}

              {formData.video_url ? (
                <div className="rounded-lg overflow-hidden bg-black mb-4">
                  <video src={formData.video_url} controls className="w-full max-h-64" />
                </div>
              ) : (
                <div className="h-48 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                  <Video className="w-12 h-12 text-slate-300" />
                </div>
              )}

              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {formData.caption || 'No caption'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Validation Messages */}
      {(validation.errors?.length > 0 || validation.warnings?.length > 0) && (
        <div className="space-y-2">
          {validation.errors?.map((error, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          ))}
          {validation.warnings?.map((warning, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="w-4 h-4" />
              {warning}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!validation.isValid || saveMutation.isPending}
          className="bg-slate-900 hover:bg-slate-800"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {post ? 'Update Post' : 'Schedule Post'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
