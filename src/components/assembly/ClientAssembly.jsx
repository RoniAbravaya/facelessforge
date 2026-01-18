import React, { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Video, Loader2, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ClientAssembly({ assemblyData, projectId, jobId, onComplete, onError }) {
  const [status, setStatus] = useState('initializing'); // initializing, downloading, normalizing, concatenating, mixing, uploading, complete, error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Initializing FFmpeg...');
  const [errorMessage, setErrorMessage] = useState(null);
  const ffmpegRef = useRef(null);
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState(false);

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      ffmpeg.on('progress', ({ progress: prog }) => {
        // FFmpeg progress is 0-1, convert to percentage
        const percent = Math.round(prog * 100);
        setProgress(percent);
      });

      // Load FFmpeg
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setIsFFmpegLoaded(true);
      setMessage('FFmpeg loaded. Starting assembly...');
      toast.success('FFmpeg loaded successfully');
    } catch (error) {
      console.error('FFmpeg load error:', error);
      setStatus('error');
      setErrorMessage(`Failed to load FFmpeg: ${error.message}`);
      onError?.(error);
    }
  };

  useEffect(() => {
    if (isFFmpegLoaded && assemblyData) {
      assembleVideo();
    }
  }, [isFFmpegLoaded, assemblyData]);

  const downloadAsZip = async () => {
    toast.info('Downloading clips and voiceover...');
    // Create simple download links as fallback
    const links = [
      ...assemblyData.clipUrls.map((url, i) => ({ url, name: `clip_${i + 1}.mp4` })),
      { url: assemblyData.voiceoverUrl, name: 'voiceover.mp3' }
    ];
    
    for (const link of links) {
      const a = document.createElement('a');
      a.href = link.url;
      a.download = link.name;
      a.click();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    toast.success('Download started for all files');
  };

  const assembleVideo = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;

    try {
      const { clipUrls, voiceoverUrl, output } = assemblyData;
      
      // Step 1: Download clips
      setStatus('downloading');
      setMessage(`Downloading ${clipUrls.length} clips...`);
      setProgress(0);

      const clipFiles = [];
      for (let i = 0; i < clipUrls.length; i++) {
        setMessage(`Downloading clip ${i + 1}/${clipUrls.length}...`);
        setProgress(Math.round(((i + 1) / clipUrls.length) * 15));
        
        const clipData = await fetchFile(clipUrls[i]);
        const clipName = `clip${i}.mp4`;
        await ffmpeg.writeFile(clipName, clipData);
        clipFiles.push(clipName);
      }

      // Download voiceover
      setMessage('Downloading voiceover...');
      const voiceoverData = await fetchFile(voiceoverUrl);
      const voiceoverExt = voiceoverUrl.includes('.wav') ? 'wav' : 'mp3';
      await ffmpeg.writeFile(`voiceover.${voiceoverExt}`, voiceoverData);
      setProgress(20);

      // Step 2: Normalize clips
      setStatus('normalizing');
      const normalizedFiles = [];
      for (let i = 0; i < clipFiles.length; i++) {
        setMessage(`Normalizing clip ${i + 1}/${clipFiles.length}...`);
        setProgress(20 + Math.round(((i + 1) / clipFiles.length) * 30));
        
        const normName = `norm${i}.mp4`;
        await ffmpeg.exec([
          '-i', clipFiles[i],
          '-vf', `scale=${output.width}:${output.height}:force_original_aspect_ratio=decrease,pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2,fps=${output.fps}`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-an',
          '-y',
          normName
        ]);
        normalizedFiles.push(normName);
      }

      // Step 3: Create concat list
      setStatus('concatenating');
      setMessage('Concatenating clips...');
      setProgress(55);

      const concatList = normalizedFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList));

      // Concatenate
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-y',
        'concat.mp4'
      ]);
      setProgress(70);

      // Step 4: Mix audio
      setStatus('mixing');
      setMessage('Mixing audio with video...');
      setProgress(75);

      await ffmpeg.exec([
        '-i', 'concat.mp4',
        '-i', `voiceover.${voiceoverExt}`,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-y',
        'final.mp4'
      ]);
      setProgress(85);

      // Step 5: Read final video
      setMessage('Reading final video...');
      const finalData = await ffmpeg.readFile('final.mp4');
      setProgress(90);

      // Step 6: Upload
      setStatus('uploading');
      setMessage('Uploading final video...');

      const blob = new Blob([finalData], { type: 'video/mp4' });
      const uploadResult = await base44.integrations.Core.UploadFile({ file: blob });
      const finalVideoUrl = uploadResult.file_url;
      setProgress(95);

      // Save artifact
      await base44.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'final_video',
        file_url: finalVideoUrl
      });

      // Update job and project status
      await base44.entities.Job.update(jobId, {
        status: 'completed',
        current_step: 'completed',
        progress: 100,
        finished_at: new Date().toISOString()
      });

      await base44.entities.Project.update(projectId, {
        status: 'completed',
        current_step: 'completed',
        progress: 100
      });

      setProgress(100);
      setStatus('complete');
      setMessage('Video assembly complete!');
      toast.success('Video assembled successfully!');
      onComplete?.(finalVideoUrl);

    } catch (error) {
      console.error('Assembly error:', error);
      setStatus('error');
      
      if (error.message?.includes('memory') || error.message?.includes('heap')) {
        setErrorMessage('Assembly failed: Not enough memory. Try on a desktop computer or download clips manually.');
      } else {
        setErrorMessage(`Assembly failed: ${error.message}`);
      }
      
      await base44.entities.Job.update(jobId, {
        status: 'failed',
        error_message: error.message
      });

      await base44.entities.Project.update(projectId, {
        status: 'failed',
        error_message: error.message
      });

      onError?.(error);
      toast.error('Video assembly failed');
    }
  };

  if (!assemblyData) return null;

  return (
    <Card className="border-blue-200 bg-blue-50 mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Video className="w-5 h-5" />
          Client-Side Video Assembly
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === 'error' ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 mb-3">{errorMessage}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={downloadAsZip}
                    variant="outline"
                    className="border-blue-300"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Clips & Audio
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => window.location.reload()}
                    variant="outline"
                    className="border-blue-300"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-blue-700">
              💡 Tip: For best results, use a desktop computer with at least 4GB RAM
            </p>
          </div>
        ) : status === 'complete' ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700 font-medium">✓ {message}</p>
            <Progress value={100} className="h-2" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <p className="text-sm text-blue-800">{message}</p>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-blue-600">{progress}% complete</p>
            <p className="text-xs text-blue-700">
              ⚠️ Keep this tab open during assembly (may take several minutes)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}