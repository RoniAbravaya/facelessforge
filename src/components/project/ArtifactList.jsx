/**
 * ArtifactList component - Displays project artifacts with inline previews.
 * Supports video playback, audio playback, and text content display.
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, Video, Download, ExternalLink, FileJson, Eye, EyeOff 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const artifactConfig = {
  script: { icon: FileText, label: 'Script', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  voiceover: { icon: Video, label: 'Voiceover', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  scene_plan: { icon: FileJson, label: 'Scene Plan', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  video_clip: { icon: Video, label: 'Video Clip', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  final_video: { icon: Video, label: 'Final Video', color: 'bg-slate-900 text-white border-slate-900' },
  thumbnail: { icon: Video, label: 'Thumbnail', color: 'bg-pink-100 text-pink-700 border-pink-300' },
  captions: { icon: FileText, label: 'Captions', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' }
};

export default function ArtifactList({ artifacts = [] }) {
  const [expandedArtifact, setExpandedArtifact] = useState(null);
  
  if (artifacts.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6 text-center text-slate-500">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p>No artifacts generated yet</p>
        </CardContent>
      </Card>
    );
  }

  const groupedArtifacts = artifacts.reduce((acc, artifact) => {
    const type = artifact.artifact_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(artifact);
    return acc;
  }, {});
  
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  
  const togglePreview = (artifactId) => {
    setExpandedArtifact(expandedArtifact === artifactId ? null : artifactId);
  };
  
  const renderPreview = (artifact, type) => {
    if (expandedArtifact !== artifact.id) return null;
    
    if (type === 'video_clip' || type === 'final_video') {
      return (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3"
        >
          <video
            src={artifact.file_url}
            controls
            className="w-full max-h-64 rounded-lg bg-black"
            preload="metadata"
          />
        </motion.div>
      );
    }
    
    if (type === 'voiceover') {
      return (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3"
        >
          <audio
            src={artifact.file_url}
            controls
            className="w-full"
            preload="metadata"
          />
        </motion.div>
      );
    }
    
    if (type === 'script' && artifact.metadata?.script) {
      return (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3"
        >
          <div className="p-4 bg-white rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{artifact.metadata.script}</p>
          </div>
        </motion.div>
      );
    }
    
    if (type === 'scene_plan' && artifact.metadata?.scenes) {
      return (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 space-y-2"
        >
          {artifact.metadata.scenes.map((scene, idx) => (
            <div key={idx} className="p-3 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">Scene {idx + 1}</Badge>
                <span className="text-xs text-slate-500">{scene.duration}s</span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2">{scene.prompt}</p>
            </div>
          ))}
        </motion.div>
      );
    }
    
    return null;
  };

  return (
    <div className="space-y-4">
      {Object.entries(groupedArtifacts).map(([type, items], groupIdx) => {
        const config = artifactConfig[type] || artifactConfig.script;
        const Icon = config.icon;

        return (
          <motion.div
            key={type}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIdx * 0.1 }}
          >
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b bg-slate-50">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Icon className="w-5 h-5 text-slate-700" />
                    {config.label}
                    {items.length > 1 && (
                      <Badge variant="outline" className="ml-2">
                        {items.length}
                      </Badge>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {items.map((artifact) => {
                    const hasPreview = artifact.file_url || 
                      (type === 'script' && artifact.metadata?.script) ||
                      (type === 'scene_plan' && artifact.metadata?.scenes);
                    const isExpanded = expandedArtifact === artifact.id;
                    
                    return (
                      <div
                        key={artifact.id}
                        className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <Badge className={`${config.color} border`}>
                                {artifact.scene_index !== null && artifact.scene_index !== undefined
                                  ? `Scene ${artifact.scene_index + 1}`
                                  : config.label}
                              </Badge>
                              {artifact.duration && (
                                <span className="text-sm text-slate-600">
                                  {artifact.duration}s
                                </span>
                              )}
                              {artifact.file_size && (
                                <span className="text-sm text-slate-600">
                                  {formatFileSize(artifact.file_size)}
                                </span>
                              )}
                              {artifact.metadata?.provider && (
                                <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                                  {artifact.metadata.provider}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {hasPreview && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => togglePreview(artifact.id)}
                                className={isExpanded ? 'bg-slate-200' : ''}
                              >
                                {isExpanded ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            {artifact.file_url && (
                              <>
                                <a href={artifact.file_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="outline" size="sm">
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                </a>
                                <a href={artifact.file_url} download>
                                  <Button variant="outline" size="sm">
                                    <Download className="w-4 h-4" />
                                  </Button>
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <AnimatePresence>
                          {renderPreview(artifact, type)}
                        </AnimatePresence>
                        
                        {artifact.metadata && Object.keys(artifact.metadata).length > 0 && !isExpanded && (
                          <details className="mt-2">
                            <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                              View metadata
                            </summary>
                            <pre className="mt-2 p-2 bg-white rounded text-xs text-slate-700 overflow-auto max-h-32">
                              {JSON.stringify(artifact.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}