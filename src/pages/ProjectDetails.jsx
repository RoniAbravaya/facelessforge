import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Download, PlayCircle, Loader2, CheckCircle2,
  XCircle, Clock, FileText, Mic, Video, Clapperboard, AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { motion } from 'framer-motion';
import JobTimeline from '../components/project/JobTimeline';
import ArtifactList from '../components/project/ArtifactList';

export default function ProjectDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0];
    },
    enabled: !!projectId,
    refetchInterval: (data) => data?.status === 'generating' ? 3000 : false
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['jobs', projectId],
    queryFn: () => base44.entities.Job.filter({ project_id: projectId }, '-created_date'),
    enabled: !!projectId,
    refetchInterval: 3000
  });

  const { data: artifacts = [] } = useQuery({
    queryKey: ['artifacts', projectId],
    queryFn: () => base44.entities.Artifact.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events', jobs[0]?.id],
    queryFn: () => base44.entities.JobEvent.filter({ job_id: jobs[0]?.id }, 'created_date'),
    enabled: !!jobs[0]?.id,
    refetchInterval: 2000
  });

  // Real-time updates using Base44 subscriptions
  useEffect(() => {
    if (!jobs[0]?.id) return;

    const unsubscribe = base44.entities.JobEvent.subscribe((event) => {
      if (event.type === 'create' && event.data.job_id === jobs[0].id) {
        console.log(`[Job ${jobs[0].id}][${event.data.step}][${event.data.event_type}] ${event.data.message}`);
        
        if (event.data.data) {
          console.log('Event data:', event.data.data);
        }
      }
    });

    return unsubscribe;
  }, [jobs[0]?.id]);

  const latestJob = jobs[0];

  const statusConfig = {
    draft: { icon: Clock, color: 'bg-slate-100 text-slate-700 border-slate-300', label: 'Draft' },
    generating: { icon: Loader2, color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'Generating', spin: true },
    pending: { icon: Clock, color: 'bg-amber-100 text-amber-700 border-amber-300', label: 'Pending' },
    running: { icon: Loader2, color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'Running', spin: true },
    completed: { icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Completed' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-700 border-red-300', label: 'Failed' }
  };

  if (loadingProject || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const currentStatus = latestJob?.status || project.status;
  const config = statusConfig[currentStatus] || statusConfig.draft;
  const Icon = config.icon;
  const finalVideo = artifacts.find(a => a.artifact_type === 'final_video');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
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
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">
                  {project.title}
                </h1>
                <p className="text-slate-600 text-lg">{project.topic}</p>
              </div>
              <Badge className={`${config.color} border`}>
                <Icon className={`w-4 h-4 mr-1.5 ${config.spin ? 'animate-spin' : ''}`} />
                {config.label}
              </Badge>
            </div>
          </motion.div>
        </div>

        {/* Project Info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Duration</p>
              <p className="text-2xl font-bold text-slate-900">{project.duration}s</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Aspect Ratio</p>
              <p className="text-2xl font-bold text-slate-900">{project.aspect_ratio}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Language</p>
              <p className="text-2xl font-bold text-slate-900">{project.language.toUpperCase()}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-sm text-slate-600 mb-1">Progress</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-slate-900">{latestJob?.progress || 0}%</p>
                {(currentStatus === 'generating' || currentStatus === 'running') && (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progress Bar */}
        {(currentStatus === 'generating' || currentStatus === 'running') && (
          <Card className="border-0 shadow-sm mb-8">
            <CardContent className="pt-6">
              <div className="mb-2 flex justify-between items-center">
                <p className="text-sm font-medium text-slate-700">
                  {latestJob?.current_step || 'Processing...'}
                </p>
                <p className="text-sm text-slate-600">{latestJob?.progress || 0}%</p>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${latestJob?.progress || 0}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {currentStatus === 'failed' && project.error_message && (
          <Card className="border-red-200 bg-red-50 mb-8">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Generation Failed</h3>
                  <p className="text-sm text-red-800">{project.error_message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Final Video */}
        {finalVideo && (
          <Card className="border-0 shadow-lg mb-8 overflow-hidden">
            <CardHeader className="border-b bg-slate-50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <PlayCircle className="w-5 h-5" />
                  Final Video
                </CardTitle>
                <a href={finalVideo.file_url} download>
                  <Button size="sm" className="bg-slate-900 hover:bg-slate-800">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </a>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <video
                src={finalVideo.file_url}
                controls
                className="w-full max-h-[600px] bg-black"
              />
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="timeline" className="space-y-6">
          <TabsList className="bg-slate-100">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <JobTimeline events={events} />
          </TabsContent>

          <TabsContent value="artifacts">
            <ArtifactList artifacts={artifacts} />
          </TabsContent>

          <TabsContent value="details">
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b bg-slate-50">
                <CardTitle>Project Configuration</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Topic</p>
                    <p className="text-slate-900">{project.topic}</p>
                  </div>
                  {project.style && (
                    <div>
                      <p className="text-sm text-slate-600 mb-1">Visual Style</p>
                      <p className="text-slate-900">{project.style}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Created</p>
                    <p className="text-slate-900">
                      {new Date(project.created_date).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}