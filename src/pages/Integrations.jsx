import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, Mic, Video, Clapperboard, CheckCircle2, XCircle, 
  Loader2, Settings, ArrowLeft, TestTube2 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const PROVIDERS = {
  llm: [
    { type: 'llm_openai', name: 'OpenAI', description: 'GPT-4 for script generation', icon: Brain }
  ],
  voice: [
    { type: 'voice_elevenlabs', name: 'ElevenLabs', description: 'Premium AI voice synthesis', icon: Mic }
  ],
  video: [
    { type: 'video_luma', name: 'Luma AI', description: 'Dream Machine video generation', icon: Video },
    { type: 'video_runway', name: 'Runway ML', description: 'Gen-2 video generation', icon: Video },
    { type: 'video_veo', name: 'Google Veo', description: 'Google Veo video generation', icon: Video }
  ],
  gemini: [
    { type: 'gemini_api', name: 'Gemini API Key', description: 'Required for Veo video downloads (Generative Language API must be enabled)', icon: Brain }
  ],
  assembly: [
    { type: 'assembly_shotstack', name: 'Shotstack', description: 'Cloud video editing API', icon: Clapperboard },
    { type: 'assembly_creatomate', name: 'Creatomate', description: 'Template-based video API', icon: Clapperboard },
    { type: 'assembly_bannerbear', name: 'Bannerbear', description: 'Video generation API', icon: Clapperboard },
    { type: 'assembly_json2video', name: 'JSON2Video', description: 'Programmatic video creation', icon: Clapperboard },
    { type: 'assembly_plainly', name: 'Plainly Videos', description: 'Automated video rendering', icon: Clapperboard }
  ]
};

export default function Integrations() {
  const [editingProvider, setEditingProvider] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [testingProvider, setTestingProvider] = useState(null);
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => base44.entities.Integration.list()
  });

  const createIntegration = useMutation({
    mutationFn: (data) => base44.entities.Integration.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['integrations']);
      setEditingProvider(null);
      setApiKey('');
      toast.success('Integration saved successfully');
    }
  });

  const updateIntegration = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Integration.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['integrations']);
      setEditingProvider(null);
      setApiKey('');
      toast.success('Integration updated successfully');
    }
  });

  const testIntegration = async (integration) => {
    setTestingProvider(integration.id);
    try {
      const { data } = await base44.functions.invoke('testIntegration', {
        integrationId: integration.id
      });
      
      if (data.success) {
        await updateIntegration.mutateAsync({
          id: integration.id,
          data: {
            status: 'active',
            last_tested_at: new Date().toISOString(),
            test_result: data.message
          }
        });
        toast.success('Connection test passed!');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast.error('Test failed: ' + error.message);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveIntegration = async (providerType, providerName) => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    const existing = integrations.find(i => i.provider_type === providerType);
    
    if (existing) {
      await updateIntegration.mutateAsync({
        id: existing.id,
        data: { api_key: apiKey, status: 'inactive' }
      });
    } else {
      await createIntegration.mutateAsync({
        provider_type: providerType,
        provider_name: providerName,
        api_key: apiKey,
        status: 'inactive'
      });
    }
  };

  const getIntegrationForProvider = (providerType) => {
    return integrations.find(i => i.provider_type === providerType);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
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
              Integrations
            </h1>
            <p className="text-slate-600 text-lg">
              Connect your provider accounts to enable video generation
            </p>
          </motion.div>
        </div>

        {/* Provider Sections */}
        <div className="space-y-8">
          {Object.entries(PROVIDERS).map(([category, providers], catIdx) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: catIdx * 0.1 }}
            >
              <h2 className="text-lg font-semibold text-slate-900 mb-4 capitalize">
                {category === 'llm' ? 'LLM Provider' : 
                 category === 'voice' ? 'Voice Provider' :
                 category === 'video' ? 'Video Generation' :
                 category === 'gemini' ? 'Gemini Configuration' :
                 'Video Assembly Service'}
              </h2>
              <div className="grid gap-4">
                {providers.map((provider) => {
                  const integration = getIntegrationForProvider(provider.type);
                  const isEditing = editingProvider === provider.type;
                  const isTesting = testingProvider === integration?.id;
                  const Icon = provider.icon;

                  return (
                    <Card key={provider.type} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg">
                              <Icon className="w-5 h-5 text-slate-700" />
                            </div>
                            <div>
                              <CardTitle className="text-lg">{provider.name}</CardTitle>
                              <CardDescription>{provider.description}</CardDescription>
                            </div>
                          </div>
                          {integration && (
                            <Badge 
                              className={
                                integration.status === 'active' 
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 border'
                                  : 'bg-slate-100 text-slate-700 border-slate-300 border'
                              }
                            >
                              {integration.status === 'active' ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Connected
                                </>
                              ) : (
                                <>
                                  <Settings className="w-3 h-3 mr-1" />
                                  Not Tested
                                </>
                              )}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <AnimatePresence mode="wait">
                          {isEditing ? (
                            <motion.div
                              key="editing"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-4"
                            >
                              <div>
                                <Label htmlFor={`api-key-${provider.type}`}>API Key</Label>
                                <Input
                                  id={`api-key-${provider.type}`}
                                  type="password"
                                  placeholder="Enter your API key"
                                  value={apiKey}
                                  onChange={(e) => setApiKey(e.target.value)}
                                  className="mt-1.5"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleSaveIntegration(provider.type, provider.name)}
                                  disabled={createIntegration.isPending || updateIntegration.isPending}
                                  className="bg-slate-900 hover:bg-slate-800"
                                >
                                  {createIntegration.isPending || updateIntegration.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : null}
                                  Save
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setEditingProvider(null);
                                    setApiKey('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="view"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex gap-2"
                            >
                              {integration ? (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setEditingProvider(provider.type);
                                      setApiKey('');
                                    }}
                                  >
                                    Update Key
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => testIntegration(integration)}
                                    disabled={isTesting}
                                  >
                                    {isTesting ? (
                                      <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Testing...
                                      </>
                                    ) : (
                                      <>
                                        <TestTube2 className="w-4 h-4 mr-2" />
                                        Test Connection
                                      </>
                                    )}
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  onClick={() => setEditingProvider(provider.type)}
                                  className="bg-slate-900 hover:bg-slate-800"
                                >
                                  Connect
                                </Button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}