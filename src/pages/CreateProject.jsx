import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function CreateProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    topic: '',
    style: '',
    duration: 30,
    language: 'en',
    aspectRatio: '9:16'
  });

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
    llm: llmProviders[0]?.id || '',
    voice: voiceProviders[0]?.id || '',
    video: videoProviders[0]?.id || '',
    assembly: assemblyProviders[0]?.id || ''
  });

  const createProject = useMutation({
    mutationFn: async (data) => {
      const project = await base44.entities.Project.create(data);
      
      const job = await base44.entities.Job.create({
        project_id: project.id,
        status: 'pending',
        current_step: 'initialization',
        progress: 0
      });

      await base44.functions.invoke('startVideoGeneration', {
        projectId: project.id,
        jobId: job.id
      });

      return project;
    },
    onSuccess: (project) => {
      toast.success('Project created! Generation started.');
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
              Step {step} of 3: {step === 1 ? 'Video Details' : step === 2 ? 'Select Providers' : 'Review & Create'}
            </p>
          </motion.div>
        </div>

        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
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
                  <div>
                    <Label htmlFor="title">Project Title *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Top 10 Space Facts"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="mt-1.5"
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

          {step < 3 ? (
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