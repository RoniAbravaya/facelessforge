import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Smartphone } from 'lucide-react';

export default function TikTokPreview({ caption = '', hashtags = '', videoUrl }) {
  const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;
  const charCount = fullCaption?.length || 0;
  const isValid = charCount <= 2200;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          TikTok Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="mx-auto max-w-sm">
          {/* Phone mockup */}
          <div className="bg-slate-900 rounded-3xl p-4 shadow-2xl">
            <div className="bg-black rounded-2xl overflow-hidden aspect-[9/16]">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  controls
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  No video selected
                </div>
              )}
              
              {/* Overlay UI */}
              <div className="relative -mt-32 p-4 text-white">
                <div className="bg-black/50 rounded-lg p-3 backdrop-blur-sm">
                  <p className="text-sm leading-relaxed line-clamp-4">
                    {fullCaption || 'Your caption will appear here...'}
                  </p>
                  <div className={`text-xs mt-2 ${isValid ? 'text-green-400' : 'text-red-400'}`}>
                    {charCount}/2200 characters
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Validation warnings */}
          {!isValid && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              Caption exceeds TikTok's 2200 character limit
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}