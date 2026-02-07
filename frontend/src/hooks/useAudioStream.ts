import { useRef, useState, useCallback } from "react";

interface UseAudioStreamOptions {
  onAudioChunk: (audioB64: string) => void;
  enabled: boolean;
  sampleRate?: number;
  bufferSize?: number;
}

export function useAudioStream(options: UseAudioStreamOptions) {
  const { onAudioChunk, enabled, sampleRate = 16000, bufferSize = 4096 } = options;
  const [isRecording, setIsRecording] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const onChunkRef = useRef(onAudioChunk);
  onChunkRef.current = onAudioChunk;

  const startRecording = useCallback(async () => {
    if (!enabled || isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const audioCtx = new AudioContext({ sampleRate });
      const source = audioCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode for raw PCM access
      // (AudioWorklet is more modern but harder to set up for hackathon)
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      processor.onaudioprocess = (event) => {
        const float32Data = event.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const int16Data = new Int16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
          const s = Math.max(-1, Math.min(1, float32Data[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Encode as base64
        const bytes = new Uint8Array(int16Data.buffer);
        const b64 = btoa(String.fromCharCode(...bytes));
        onChunkRef.current(b64);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      mediaStreamRef.current = stream;
      audioCtxRef.current = audioCtx;
      processorRef.current = processor;
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, [enabled, isRecording, sampleRate, bufferSize]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  return { isRecording, startRecording, stopRecording };
}
