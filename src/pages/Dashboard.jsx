import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Video, Clock, CheckCircle2, XCircle, Loader2, Play } from 'lucide-react';
import { createPageUrl } from '../utils';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date', 50)
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => base44.entities.Integration.list()
  });

  const activeIntegrations = integrations.filter(i => i.status === 'active');
  const hasLLM = activeIntegrations.some(i => i.provider_type.startsWith('llm_'));
  const hasVoice = activeIntegrations.some(i => i.provider_type.startsWith('voice_'));
  const hasVideo = activeIntegrations.some(i => i.provider_type.startsWith('video_'));
  const hasAssembly = activeIntegrations.some(i => i.provider_type.startsWith('assembly_'));
  const allIntegrationsReady = hasLLM && hasVoice && hasVideo && hasAssembly;

  const statusConfig = {
    draft: { icon: Clock, color: 'bg-slate-100 text-slate-700 border-slate-300', label: 'Draft' },
    generating: { icon: Loader2, color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'Generating', spin: true },
    completed: { icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Completed' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-700 border-red-300', label: 'Failed' }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-12">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">
                FacelessForge
              </h1>
              <p className="text-slate-600 text-lg">AI-powered video generation platform</p>
            </div>
            <Link to={createPageUrl('CreateProject')}>
              <Button 
                size="lg"
                disabled={!allIntegrationsReady}
                className="bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20 hover:shadow-xl transition-all duration-300"
              >
                <Plus className="w-5 h-5 mr-2" />
                New Project
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Setup Warning */}
        {!allIntegrationsReady && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8"
          >
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Play className="w-5 h-5 text-amber-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-900 mb-1">Setup Required</h3>
                    <p className="text-sm text-amber-800 mb-3">
                      Connect your provider accounts to start generating videos
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {!hasLLM && <Badge variant="outline" className="border-amber-300 text-amber-700">LLM Provider</Badge>}
                      {!hasVoice && <Badge variant="outline" className="border-amber-300 text-amber-700">Voice Provider</Badge>}
                      {!hasVideo && <Badge variant="outline" className="border-amber-300 text-amber-700">Video Provider</Badge>}
                      {!hasAssembly && <Badge variant="outline" className="border-amber-300 text-amber-700">Assembly Service</Badge>}
                    </div>
                    <Link to={createPageUrl('Integrations')}>
                      <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-100">
                        Configure Integrations
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {[
            { label: 'Total Projects', value: projects.length, icon: Video, color: 'text-blue-600' },
            { label: 'Completed', value: projects.filter(p => p.status === 'completed').length, icon: CheckCircle2, color: 'text-emerald-600' },
            { label: 'In Progress', value: projects.filter(p => p.status === 'generating').length, icon: Loader2, color: 'text-amber-600' },
            { label: 'Integrations', value: activeIntegrations.length, icon: Play, color: 'text-purple-600' }
          ].map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">{stat.label}</p>
                      <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                    </div>
                    <div className={`p-3 rounded-xl bg-slate-50 ${stat.color}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Projects List */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="border-b bg-slate-50">
            <CardTitle className="text-xl font-semibold text-slate-900">Recent Projects</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p>Loading projects...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="p-12 text-center">
                <Video className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 mb-4">No projects yet</p>
                <Link to={createPageUrl('CreateProject')}>
                  <Button disabled={!allIntegrationsReady}>Create your first project</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {projects.map((project, idx) => {
                  const config = statusConfig[project.status] || statusConfig.draft;
                  const Icon = config.icon;
                  
                  return (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-6 hover:bg-slate-50 transition-colors"
                    >
                      <Link to={createPageUrl('ProjectDetails') + '?id=' + project.id}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-slate-900 mb-1">
                              {project.title}
                            </h3>
                            <p className="text-sm text-slate-600 mb-3">{project.topic}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>{project.duration}s</span>
                              <span>•</span>
                              <span>{project.aspect_ratio}</span>
                              <span>•</span>
                              <span>{new Date(project.created_date).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {project.status === 'generating' && (
                              <div className="text-right">
                                <div className="text-sm font-medium text-slate-700 mb-1">
                                  {project.progress}%
                                </div>
                                <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${project.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            <Badge className={`${config.color} border`}>
                              <Icon className={`w-3 h-3 mr-1.5 ${config.spin ? 'animate-spin' : ''}`} />
                              {config.label}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}