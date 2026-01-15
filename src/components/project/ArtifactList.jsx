import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, Mic, Video, Image, Download, ExternalLink, FileJson 
} from 'lucide-react';
import { motion } from 'framer-motion';

const artifactConfig = {
  script: { icon: FileText, label: 'Script', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  voiceover: { icon: Mic, label: 'Voiceover', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  scene_plan: { icon: FileJson, label: 'Scene Plan', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  video_clip: { icon: Video, label: 'Video Clip', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  final_video: { icon: Video, label: 'Final Video', color: 'bg-slate-900 text-white border-slate-900' },
  thumbnail: { icon: Image, label: 'Thumbnail', color: 'bg-pink-100 text-pink-700 border-pink-300' },
  captions: { icon: FileText, label: 'Captions', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' }
};

export default function ArtifactList({ artifacts = [] }) {
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
                  {items.map((artifact, idx) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
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
                        </div>
                        {artifact.metadata && Object.keys(artifact.metadata).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                              View metadata
                            </summary>
                            <pre className="mt-2 p-2 bg-white rounded text-xs text-slate-700 overflow-auto">
                              {JSON.stringify(artifact.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>

                      <div className="flex gap-2">
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
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}