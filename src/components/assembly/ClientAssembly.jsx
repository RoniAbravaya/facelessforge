import React, { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Video, Loader2, Download, Play } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ClientAssembly({ assemblyData, projectId, jobId, onComplete, onError }) {
  const [status, setStatus] = useState('idle'); // idle, initializing, downloading, normalizing, concatenating, mixing, uploading, complete, error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Ready to assemble video in your browser');
  const [errorMessage, setErrorMessage] = useState(null);
  const [logs, setLogs] = useState([]);
  const ffmpegRef = useRef(null);
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState(false);
  const [manualStart, setManualStart] = useState(false);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [...prev, { message: msg, type, time: new Date().toLocaleTimeString() }]);
  };

  // Auto-start after 2 seconds or show manual button
  useEffect(() => {
    if (assemblyData && !manualStart) {
      const timer = setTimeout(() => {
        setManualStart(true);
        addLog('Ready to start assembly', 'info');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [assemblyData]);

  const startAssembly = async () => {
    setManualStart(false);
    await loadFFmpeg();
  };

  const loadFFmpeg = async () => {
    try {
      setStatus('initializing');
      setMessage('Loading FFmpeg...');
      addLog('Initializing FFmpeg...', 'info');
      
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      ffmpeg.on('progress', ({ progress: prog }) => {
        const percent = Math.round(prog * 100);
        if (percent > progress) {
          setProgress(percent);
        }
      });

      // Load FFmpeg from CDN
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setIsFFmpegLoaded(true);
      setMessage('FFmpeg loaded successfully');
      addLog('FFmpeg loaded successfully', 'success');
      toast.success('FFmpeg loaded');
      
      // Start assembly
      await assembleVideo();
    } catch (error) {
      console.error('FFmpeg load error:', error);
      addLog(`Failed to load FFmpeg: ${error.message}`, 'error');
      setStatus('error');
      setErrorMessage(`Failed to load FFmpeg: ${error.message}. Try a desktop browser with more memory.`);
      onError?.(error);
    }
  };

  const downloadAsZip = async () => {
    addLog('Starting manual downloads...', 'info');
    toast.info('Downloading clips and voiceover...');
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
    addLog('Downloads started', 'success');
    toast.success('Download started for all files');
  };

  const fetchWithProxy = async (url) => {
    const isGoogleUrl = url.includes('generativelanguage.googleapis.com');

    // For Google URLs, ALWAYS use proxy with projectId
    if (isGoogleUrl) {
      addLog(`Using proxy for Google URL (projectId: ${projectId})`, 'info');
      const proxyUrl = `/api/functions/proxyMedia?projectId=${encodeURIComponent(projectId)}&url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        addLog(`Proxy failed: ${errorData.errorCode || 'unknown'} - ${errorData.error}`, 'error');

        if (errorData.errorCode === 'service_disabled') {
          throw new Error('Your Gemini API key\'s project must have Generative Language API enabled. Update your key in Integrations.');
        }
        throw new Error(errorData.error || `Proxy fetch failed: ${response.status}`);
      }

      return await response.arrayBuffer();
    }

    // For non-Google URLs (like Base44 storage), fetch directly
    addLog(`Direct fetch for Base44 URL`, 'info');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Direct fetch failed: ${response.status}`);
    }
    return await response.arrayBuffer();
  };

  const assembleVideo = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;

    try {
      const { clipUrls, voiceoverUrl, output } = assemblyData;
      
      // Step 1: Download clips
      setStatus('downloading');
      addLog(`Starting download of ${clipUrls.length} clips...`, 'info');
      setMessage(`Downloading ${clipUrls.length} clips...`);
      setProgress(0);

      const clipFiles = [];
      for (let i = 0; i < clipUrls.length; i++) {
        setMessage(`Downloading clip ${i + 1}/${clipUrls.length}...`);
        addLog(`Downloading clip ${i + 1}/${clipUrls.length}: ${clipUrls[i].substring(0, 60)}...`, 'info');
        setProgress(Math.round(((i + 1) / clipUrls.length) * 15));

        try {
          const clipData = await fetchWithProxy(clipUrls[i]);
          const clipName = `clip${i}.mp4`;
          await ffmpeg.writeFile(clipName, new Uint8Array(clipData));
          clipFiles.push(clipName);
          addLog(`✓ Clip ${i + 1} downloaded (${(clipData.byteLength / 1024 / 1024).toFixed(2)} MB)`, 'success');
        } catch (clipError) {
          addLog(`✗ Clip ${i + 1} download failed: ${clipError.message}`, 'error');
          throw new Error(`Failed to download clip ${i + 1}: ${clipError.message}`);
        }
      }

      // Download voiceover
      setMessage('Downloading voiceover...');
      addLog('Downloading voiceover...', 'info');
      const voiceoverData = await fetchWithProxy(voiceoverUrl);
      const voiceoverExt = voiceoverUrl.includes('.wav') ? 'wav' : 'mp3';
      await ffmpeg.writeFile(`voiceover.${voiceoverExt}`, new Uint8Array(voiceoverData));
      setProgress(20);
      addLog('All downloads complete', 'success');

      // Step 2: Normalize clips
      setStatus('normalizing');
      addLog('Starting video normalization...', 'info');
      const normalizedFiles = [];
      for (let i = 0; i < clipFiles.length; i++) {
        setMessage(`Normalizing clip ${i + 1}/${clipFiles.length}...`);
        addLog(`Normalizing clip ${i + 1}/${clipFiles.length}`, 'info');
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
      addLog('All clips normalized', 'success');

      // Step 3: Create concat list
      setStatus('concatenating');
      setMessage('Concatenating clips...');
      addLog('Creating concat list...', 'info');
      setProgress(55);

      const concatList = normalizedFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList));

      // Concatenate
      addLog('Concatenating clips...', 'info');
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-y',
        'concat.mp4'
      ]);
      setProgress(70);
      addLog('Clips concatenated', 'success');

      // Step 4: Mix audio with compression
      // Re-encode with H.264 to reduce file size below 50MB UploadFile limit
      // CRF 28 provides good quality/size balance (~30-50% smaller than copy)
      // Adjust CRF: lower (24-26) = better quality but larger, higher (30-32) = smaller but lower quality
      setStatus('mixing');
      setMessage('Mixing audio and compressing video...');
      addLog('Mixing audio track and compressing video...', 'info');
      setProgress(75);

      await ffmpeg.exec([
        '-i', 'concat.mp4',
        '-i', `voiceover.${voiceoverExt}`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-y',
        'final.mp4'
      ]);
      setProgress(85);
      addLog('Audio mixed and video compressed successfully', 'success');

      // Step 5: Read final video
      setMessage('Reading final video...');
      addLog('Reading assembled video from memory...', 'info');
      let finalData = await ffmpeg.readFile('final.mp4');
      const finalSizeMB = (finalData.length / 1024 / 1024).toFixed(2);
      setProgress(90);
      addLog(`Final compressed video size: ${finalSizeMB} MB`, 'info');
      
      // Check if still over limit and apply secondary compression if needed
      if (finalData.length > 50 * 1024 * 1024) {
        addLog(`⚠️ File still over 50MB (${finalSizeMB}MB), applying secondary compression...`, 'warning');
        setMessage('Applying additional compression...');
        await ffmpeg.exec([
          '-i', 'final.mp4',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '30',
          '-c:a', 'aac',
          '-b:a', '96k',
          '-movflags', 'faststart',
          '-y',
          'final_compressed.mp4'
        ]);
        finalData = await ffmpeg.readFile('final_compressed.mp4');
        const compressedSizeMB = (finalData.length / 1024 / 1024).toFixed(2);
        addLog(`✓ Secondary compression complete: ${compressedSizeMB} MB`, 'success');
      }

      // Step 6: Upload
      setStatus('uploading');
      setMessage('Uploading final video...');
      addLog(`Uploading final video (${(finalData.length / 1024 / 1024).toFixed(2)} MB)...`, 'info');

      // Create a proper File object (not just Blob)
      const file = new File([finalData], 'final.mp4', { type: 'video/mp4' });
      addLog(`File created: ${file.name}, size: ${file.size} bytes`, 'info');
      
      let finalVideoUrl;
      try {
        const uploadResult = await base44.integrations.Core.UploadFile({ file: file });
        finalVideoUrl = uploadResult.file_url;
        setProgress(95);
        addLog(`Upload complete: ${finalVideoUrl}`, 'success');
      } catch (uploadError) {
        addLog(`Upload failed: ${uploadError.message}`, 'error');
        console.error('Upload error details:', uploadError);
        throw new Error(`Failed to upload video: ${uploadError.message}`);
      }

      // Save artifact
      addLog('Saving artifact metadata...', 'info');
      await base44.entities.Artifact.create({
        job_id: jobId,
        project_id: projectId,
        artifact_type: 'final_video',
        file_url: finalVideoUrl,
        file_size: finalData.length,
        duration: assemblyData.duration
      });

      // Update job and project status
      addLog('Updating job status...', 'info');
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
      addLog('✅ Assembly complete!', 'success');
      toast.success('Video assembled successfully!');
      onComplete?.(finalVideoUrl);

    } catch (error) {
      console.error('Assembly error:', error);
      addLog(`❌ Error: ${error.message}`, 'error');
      setStatus('error');
      
      let userMessage = error.message;
      if (error.message?.includes('memory') || error.message?.includes('heap')) {
        userMessage = 'Not enough memory. Try on a desktop computer or download clips manually.';
      } else if (error.message?.includes('fetch') || error.message?.includes('network')) {
        userMessage = 'Network error. Check your connection and try again.';
      }
      
      setErrorMessage(`Assembly failed: ${userMessage}`);
      
      await base44.entities.Job.update(jobId, {
        status: 'failed',
        current_step: 'video_assembly',
        error_message: userMessage
      });

      await base44.entities.Project.update(projectId, {
        status: 'failed',
        current_step: 'video_assembly',
        error_message: userMessage
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
          Browser-Based Video Assembly
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'idle' && manualStart ? (
          <div className="space-y-3">
            <p className="text-sm text-blue-800">
              Video clips are ready. Click below to start assembling in your browser.
            </p>
            <Button
              onClick={startAssembly}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Assembly
            </Button>
            <p className="text-xs text-blue-700">
              💡 Recommended: Use desktop Chrome/Edge with at least 4GB RAM
            </p>
          </div>
        ) : status === 'error' ? (
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
              <p className="text-sm text-blue-800 font-medium">{message}</p>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-blue-600">{progress}% complete</p>
            <p className="text-xs text-blue-700">
              ⚠️ Keep this tab open (assembly takes 2-5 minutes)
            </p>
          </div>
        )}

        {/* Assembly Logs */}
        {logs.length > 0 && (
          <div className="mt-4 border-t border-blue-200 pt-3">
            <p className="text-xs font-semibold text-blue-900 mb-2">Assembly Log:</p>
            <div className="space-y-1 max-h-32 overflow-y-auto text-xs">
              {logs.slice(-10).map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${
                    log.type === 'error' ? 'text-red-700' :
                    log.type === 'success' ? 'text-green-700' :
                    log.type === 'warning' ? 'text-amber-700' :
                    'text-blue-700'
                  }`}
                >
                  <span className="opacity-50">{log.time}</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}