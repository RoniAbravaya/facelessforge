import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Video as VideoIcon, Calendar, Wand2, Layout } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import SuggestionField from '../components/project/SuggestionField';
import QuotaWarning from '../components/project/QuotaWarning';
import InsightSuggestions from '../components/project/InsightSuggestions';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getAllTemplates, getTemplate, applyTemplateDefaults, getRandomTopicSuggestion } from '../lib/templates';

export default function CreateProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    topic: '',
    style: '',
    duration: 30,
    language: 'en',
    aspectRatio: '9:16',
    tiktok_settings: {
      enabled: false,
      caption: '',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      post_mode: 'post_now',
      scheduled_time: '',
      post_status: 'pending'
    }
  });

  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [previousSuggestions, setPreviousSuggestions] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const templates = getAllTemplates();

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => base44.entities.Integration.list()
  });

  const activeIntegrations = integrations.filter(i => i.status === 'active');
  const llmProviders = activeIntegrations.filter(i => i.provider_type.startsWith('llm_'));
  const voiceProviders = activeIntegrations.filter(i => i.provider_type.startsWith('voice_'));
  const videoProviders = activeIntegrations.filter(i => i.provider_type.startsWith('video_'));
  const assemblyProviders = activeIntegrations.filter(i => i.provider_type.startsWith('assembly_'));

  const [selectedProviders, setSelectedProviders] = useState({
    llm: '',
    voice: '',
    video: '',
    assembly: ''
  });

  // Initialize selected providers when integrations are loaded
  React.useEffect(() => {
    if (integrations.length > 0) {
      setSelectedProviders(prev => ({
        llm: prev.llm || llmProviders[0]?.id || '',
        voice: prev.voice || voiceProviders[0]?.id || '',
        video: prev.video || videoProviders[0]?.id || '',
        assembly: prev.assembly || assemblyProviders[0]?.id || ''
      }));
    }
  }, [integrations, llmProviders, voiceProviders, videoProviders, assemblyProviders]);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const result = await base44.functions.invoke('generateProjectSuggestions', {
        excludeSuggestions: previousSuggestions
      });
      setSuggestions(result.data.suggestion);
      setPreviousSuggestions([...previousSuggestions, result.data.suggestion]);
      
      if (result.data.hasAnalytics) {
        toast.success(`AI analyzed ${result.data.topPerformers} top videos (avg ${result.data.avgEngagement}% engagement)`);
      } else {
        toast.success('AI generated suggestions based on trending topics');
      }
    } catch (error) {
      toast.error('Failed to generate suggestions: ' + error.message);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const applyTemplate = (templateId) => {
    const template = getTemplate(templateId);
    if (!template) return;
    
    setSelectedTemplate(templateId);
    setFormData(prev => ({
      ...prev,
      ...applyTemplateDefaults(templateId, prev),
      topic: prev.topic || getRandomTopicSuggestion(templateId) || '',
    }));
    
    toast.success(`Applied "${template.name}" template`);
  };

  const createProject = useMutation({
    mutationFn: async (data) => {
      // Check quota
      const { data: quotaStatus } = await base44.functions.invoke('checkUserQuota', {});
      
      const project = await base44.entities.Project.create(data);
      
      const job = await base44.entities.Job.create({
        project_id: project.id,
        status: quotaStatus.should_queue ? 'queued' : 'pending',
        current_step: 'initialization',
        progress: 0,
        queued_reason: quotaStatus.should_queue ? 'quota_exceeded' : null
      });

      if (!quotaStatus.should_queue) {
        await base44.functions.invoke('incrementUsage', {});
        await base44.functions.invoke('startVideoGeneration', {
          projectId: project.id,
          jobId: job.id
        });
      }

      return { project, queued: quotaStatus.should_queue };
    },
    onSuccess: ({ project, queued }) => {
      if (queued) {
        toast.success('Project created and queued! Will process tomorrow at quota reset.');
      } else {
        toast.success('Project created! Generation started.');
      }
      navigate(createPageUrl('ProjectDetails') + '?id=' + project.id);
    },
    onError: (error) => {
      toast.error('Failed to create project: ' + error.message);
    }
  });

  const handleNext = () => {
    if (step === 1) {
      if (!formData.title || !formData.topic) {
        toast.error('Please fill in all required fields');
        return;
      }
    }
    
    if (step === 2) {
      if (!selectedProviders.llm || !selectedProviders.voice || 
          !selectedProviders.video || !selectedProviders.assembly) {
        toast.error('Please select all providers');
        return;
      }
    }

    if (step === 3) {
      if (formData.tiktok_settings.enabled && formData.tiktok_settings.post_mode === 'schedule' && !formData.tiktok_settings.scheduled_time) {
        toast.error('Please select a scheduled time');
        return;
      }
    }

    setStep(step + 1);
  };

  const handleSubmit = () => {
    createProject.mutate({
      ...formData,
      status: 'generating',
      current_step: 'script_generation',
      progress: 0,
      selected_providers: selectedProviders
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-10">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="ghost" size="sm" className="mb-4 text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">
              Create New Project
            </h1>
            <p className="text-slate-600 text-lg">
              Step {step} of 4: {step === 1 ? 'Video Details' : step === 2 ? 'Select Providers' : step === 3 ? 'TikTok Settings' : 'Review & Create'}
            </p>
            <div className="mt-4">
              <QuotaWarning />
            </div>
          </motion.div>
        </div>

        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full transition-all duration-500 ${
                  s <= step ? 'bg-slate-900' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-slate-700" />
                    Video Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* AI Insights */}
                  <InsightSuggestions
                    onApply={(insight) => {
                      if (insight.insight_type === 'topic') {
                        setFormData({ ...formData, topic: insight.attribute_value });
                        toast.success(`Applied topic suggestion: ${insight.attribute_value}`);
                      } else if (insight.insight_type === 'style') {
                        setFormData({ ...formData, style: insight.attribute_value });
                        toast.success(`Applied style suggestion: ${insight.attribute_value}`);
                      } else if (insight.insight_type === 'duration') {
                        const duration = insight.attribute_value.includes('60s+') ? 60 : 
                                       insight.attribute_value.includes('30-60s') ? 45 : 30;
                        setFormData({ ...formData, duration });
                        toast.success(`Applied duration suggestion: ${duration}s`);
                      } else if (insight.insight_type === 'aspect_ratio') {
                        setFormData({ ...formData, aspectRatio: insight.attribute_value });
                        toast.success(`Applied aspect ratio: ${insight.attribute_value}`);
                      }
                    }}
                  />

                  {/* Template Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Layout className="w-5 h-5 text-slate-600" />
                      <Label className="text-base font-medium">Start with a Template (Optional)</Label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {templates.slice(0, 8).map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template.id)}
                          className={`p-3 rounded-lg border-2 text-left transition-all hover:border-slate-400 hover:bg-slate-50 ${
                            selectedTemplate === template.id 
                              ? 'border-slate-900 bg-slate-50' 
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="text-lg mb-1">{template.icon}</div>
                          <div className="text-xs font-medium text-slate-900 truncate">{template.name}</div>
                        </button>
                      ))}
                    </div>
                    {selectedTemplate && (
                      <p className="text-xs text-slate-600">
                        Template applied: {getTemplate(selectedTemplate)?.description}
                      </p>
                    )}
                  </div>

                  {/* AI Suggestions Button */}
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-purple-600" />
                        <div>
                          <h3 className="font-semibold text-purple-900">AI Suggestion Assistant</h3>
                          <p className="text-xs text-purple-700 mt-0.5">
                            Get data-driven ideas based on your analytics & trends
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={fetchSuggestions}
                        disabled={loadingSuggestions}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {loadingSuggestions ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Get Suggestions
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="title">Project Title *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Top 10 Space Facts"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="mt-1.5"
                    />
                    <SuggestionField
                      suggestion={suggestions?.title}
                      isLoading={loadingSuggestions}
                      onUse={() => setFormData({ ...formData, title: suggestions.title })}
                      onRegenerate={fetchSuggestions}
                    />
                  </div>

                  <div>
                    <Label htmlFor="topic">Video Topic *</Label>
                    <Textarea
                      id="topic"
                      placeholder="Describe what your video should be about..."
                      value={formData.topic}
                      onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                      className="mt-1.5 min-h-[100px]"
                    />
                    <SuggestionField
                      suggestion={suggestions?.topic}
                      isLoading={loadingSuggestions}
                      onUse={() => setFormData({ ...formData, topic: suggestions.topic })}
                      onRegenerate={fetchSuggestions}
                      reasoning={suggestions?.reasoning}
                    />
                  </div>

                  <div>
                    <Label htmlFor="style">Visual Style</Label>
                    <Input
                      id="style"
                      placeholder="e.g., cinematic, futuristic, minimalist"
                      value={formData.style}
                      onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                      className="mt-1.5"
                    />
                    <SuggestionField
                      suggestion={suggestions?.style}
                      isLoading={loadingSuggestions}
                      onUse={() => setFormData({ ...formData, style: suggestions.style })}
                      onRegenerate={fetchSuggestions}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="duration">Duration (seconds)</Label>
                      <Input
                        id="duration"
                        type="number"
                        min="15"
                        max="120"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="aspect">Aspect Ratio</Label>
                      <Select
                        value={formData.aspectRatio}
                        onValueChange={(value) => setFormData({ ...formData, aspectRatio: value })}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="9:16">9:16 (TikTok)</SelectItem>
                          <SelectItem value="16:9">16:9 (YouTube)</SelectItem>
                          <SelectItem value="1:1">1:1 (Instagram)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="language">Language</Label>
                      <Select
                        value={formData.language}
                        onValueChange={(value) => setFormData({ ...formData, language: value })}
                      >
                        <SelectTrigger className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50">
                  <CardTitle>Select Providers</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <Label>LLM Provider (Script Generation)</Label>
                    <Select
                      value={selectedProviders.llm}
                      onValueChange={(value) => setSelectedProviders({ ...selectedProviders, llm: value })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select LLM provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {llmProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Voice Provider (Text-to-Speech)</Label>
                    <Select
                      value={selectedProviders.voice}
                      onValueChange={(value) => setSelectedProviders({ ...selectedProviders, voice: value })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select voice provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {voiceProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Video Provider (Scene Generation)</Label>
                    <Select
                      value={selectedProviders.video}
                      onValueChange={(value) => setSelectedProviders({ ...selectedProviders, video: value })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select video provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {videoProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Assembly Service (Final Video Editing)</Label>
                    <Select
                      value={selectedProviders.assembly}
                      onValueChange={(value) => setSelectedProviders({ ...selectedProviders, assembly: value })}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select assembly service" />
                      </SelectTrigger>
                      <SelectContent>
                        {assemblyProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50">
                  <CardTitle className="flex items-center gap-2">
                    <VideoIcon className="w-5 h-5" />
                    TikTok Publishing (Optional)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Post to TikTok</Label>
                      <p className="text-sm text-slate-600 mt-1">Automatically publish your video after generation</p>
                    </div>
                    <Switch
                      checked={formData.tiktok_settings.enabled}
                      onCheckedChange={(checked) => 
                        setFormData({
                          ...formData,
                          tiktok_settings: { ...formData.tiktok_settings, enabled: checked }
                        })
                      }
                    />
                  </div>

                  {formData.tiktok_settings.enabled && (
                    <div className="space-y-4 pl-4 border-l-2 border-slate-200">
                      <div>
                        <Label htmlFor="caption">Caption</Label>
                        <Textarea
                          id="caption"
                          placeholder="Add a caption for your TikTok video..."
                          value={formData.tiktok_settings.caption}
                          onChange={(e) => 
                            setFormData({
                              ...formData,
                              tiktok_settings: { ...formData.tiktok_settings, caption: e.target.value }
                            })
                          }
                          className="mt-1.5"
                          maxLength={2200}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {formData.tiktok_settings.caption.length}/2200 characters
                        </p>
                      </div>

                      <div>
                        <Label>Privacy Level</Label>
                        <Select
                          value={formData.tiktok_settings.privacy_level}
                          onValueChange={(value) => 
                            setFormData({
                              ...formData,
                              tiktok_settings: { ...formData.tiktok_settings, privacy_level: value }
                            })
                          }
                        >
                          <SelectTrigger className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PUBLIC_TO_EVERYONE">Public</SelectItem>
                            <SelectItem value="MUTUAL_FOLLOW_FRIENDS">Friends Only</SelectItem>
                            <SelectItem value="SELF_ONLY">Private</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Post Mode</Label>
                        <Select
                          value={formData.tiktok_settings.post_mode}
                          onValueChange={(value) => 
                            setFormData({
                              ...formData,
                              tiktok_settings: { ...formData.tiktok_settings, post_mode: value }
                            })
                          }
                        >
                          <SelectTrigger className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="post_now">Post Immediately</SelectItem>
                            <SelectItem value="save_draft">Save as Draft</SelectItem>
                            <SelectItem value="schedule">Schedule for Later</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.tiktok_settings.post_mode === 'schedule' && (
                        <div>
                          <Label htmlFor="scheduled_time" className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Scheduled Time
                          </Label>
                          <Input
                            id="scheduled_time"
                            type="datetime-local"
                            value={formData.tiktok_settings.scheduled_time}
                            onChange={(e) => 
                              setFormData({
                                ...formData,
                                tiktok_settings: { ...formData.tiktok_settings, scheduled_time: e.target.value }
                              })
                            }
                            className="mt-1.5"
                            min={new Date().toISOString().slice(0, 16)}
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Your video will be posted automatically at this time
                          </p>
                        </div>
                      )}

                      {formData.tiktok_settings.post_mode === 'save_draft' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-900">
                            <strong>Note:</strong> Draft videos will be saved to your TikTok account. 
                            Open the TikTok app to finish editing and publish.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50">
                  <CardTitle>Review & Confirm</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-600 mb-1">Title</p>
                      <p className="font-semibold text-slate-900">{formData.title}</p>
                    </div>
                    <div>
                      <p className="text-slate-600 mb-1">Duration</p>
                      <p className="font-semibold text-slate-900">{formData.duration}s</p>
                    </div>
                    <div>
                      <p className="text-slate-600 mb-1">Aspect Ratio</p>
                      <p className="font-semibold text-slate-900">{formData.aspectRatio}</p>
                    </div>
                    <div>
                      <p className="text-slate-600 mb-1">Language</p>
                      <p className="font-semibold text-slate-900">{formData.language}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-600 mb-1 text-sm">Topic</p>
                    <p className="text-slate-900">{formData.topic}</p>
                  </div>
                  
                  {formData.tiktok_settings.enabled && (
                    <div className="border-t pt-4 mt-4">
                      <p className="text-slate-600 mb-2 text-sm font-semibold">TikTok Publishing</p>
                      <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Mode:</span>
                          <span className="font-medium text-slate-900">
                            {formData.tiktok_settings.post_mode === 'post_now' ? 'Post Immediately' : 
                             formData.tiktok_settings.post_mode === 'save_draft' ? 'Save as Draft' : 'Scheduled'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Privacy:</span>
                          <span className="font-medium text-slate-900">
                            {formData.tiktok_settings.privacy_level === 'PUBLIC_TO_EVERYONE' ? 'Public' : 
                             formData.tiktok_settings.privacy_level === 'MUTUAL_FOLLOW_FRIENDS' ? 'Friends' : 'Private'}
                          </span>
                        </div>
                        {formData.tiktok_settings.scheduled_time && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Scheduled:</span>
                            <span className="font-medium text-slate-900">
                              {new Date(formData.tiktok_settings.scheduled_time).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          {step < 4 ? (
            <Button onClick={handleNext} className="bg-slate-900 hover:bg-slate-800">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={createProject.isPending}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {createProject.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create Project
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}