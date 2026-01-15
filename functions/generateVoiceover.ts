import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const { apiKey, providerType, text, language } = await req.json();

    if (providerType === 'voice_elevenlabs') {
      // Get available voices
      const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey }
      });

      if (!voicesResponse.ok) {
        throw new Error('Failed to fetch ElevenLabs voices');
      }

      const voicesData = await voicesResponse.json();
      const voices = voicesData.voices || [];
      
      // Select first available voice or a good default
      const selectedVoice = voices[0]?.voice_id || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice as fallback

      // Generate audio
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error: ${error}`);
      }

      // Get audio blob
      const audioBlob = await response.blob();
      
      // Convert blob to file for upload
      const audioFile = new File([audioBlob], 'voiceover.mp3', { type: 'audio/mpeg' });
      
      // Upload to Base44 storage
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
        file: audioFile
      });

      return Response.json({ audioUrl: uploadResult.file_url });
    }

    throw new Error('Unsupported voice provider');

  } catch (error) {
    console.error('Generate voiceover error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});