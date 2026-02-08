import { useState, useCallback, useRef, useEffect } from "react";
import { useSocketIO } from "./hooks/useSocketIO";
import { useAudioStream } from "./hooks/useAudioStream";
import VoiceControls from "./components/VoiceControls";
import BrowserView from "./components/BrowserView";
import TranscriptPanel from "./components/TranscriptPanel";
import StatusIndicator from "./components/StatusIndicator";
import TextInput from "./components/TextInput";

export interface TranscriptEntry {
  text: string;
  role: "user" | "assistant" | "system";
  timestamp: number;
}

/**
 * Queue-based audio player — uses a single AudioContext and chains
 * AudioBufferSourceNodes back-to-back to avoid gaps/glitches.
 */
class AudioQueue {
  private ctx: AudioContext | null = null;
  private queue: Float32Array[] = [];
  private isPlaying = false;

  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 16000 });
    }
  }

  stop() {
    this.queue = [];
    this.isPlaying = false;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  enqueue(audioB64: string) {
    try {
      const audioBytes = Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0));
      // Convert 16-bit PCM to Float32
      const float32 = new Float32Array(audioBytes.length / 2);
      const dataView = new DataView(audioBytes.buffer, audioBytes.byteOffset, audioBytes.byteLength);
      for (let i = 0; i < float32.length; i++) {
        float32[i] = dataView.getInt16(i * 2, true) / 32768;
      }
      this.queue.push(float32);
      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (e) {
      console.error("Failed to decode audio chunk:", e);
    }
  }

  private playNext() {
    if (!this.ctx || this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const samples = this.queue.shift()!;
    const buffer = this.ctx.createBuffer(1, samples.length, 16000);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.onended = () => this.playNext();
    source.start();
  }

  clear() {
    this.queue = [];
  }
}

function App() {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState("Disconnected");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const audioQueueRef = useRef(new AudioQueue());

  // Clean up audio queue on unmount
  useEffect(() => {
    return () => audioQueueRef.current.stop();
  }, []);

  const addTranscript = useCallback((text: string, role: TranscriptEntry["role"]) => {
    setTranscripts((prev) => [
      ...prev,
      { text, role, timestamp: Date.now() },
    ]);
  }, []);

  const { isConnected, startSession, stopSession, sendAudio, sendText } =
    useSocketIO({
      onTranscript: (text, role) => addTranscript(text, role),
      onAudio: (audioB64) => {
        audioQueueRef.current.enqueue(audioB64);
      },
      onStatus: (message) => setStatus(message),
      onScreenshot: (imageB64) => setScreenshot(imageB64),
      onSessionStarted: () => {
        setIsSessionActive(true);
        audioQueueRef.current.start();
        setStatus("Listening...");
      },
      onSessionStopped: () => {
        setIsSessionActive(false);
        audioQueueRef.current.stop();
        setStatus("Session ended");
      },
      onError: (message) => {
        setStatus(`Error: ${message}`);
        addTranscript(message, "system");
      },
    });

  const { isRecording, startRecording, stopRecording } = useAudioStream({
    onAudioChunk: sendAudio,
    enabled: isSessionActive,
  });

  const handleToggleSession = useCallback(() => {
    if (isSessionActive) {
      stopRecording();
      stopSession();
    } else {
      startSession();
    }
  }, [isSessionActive, startSession, stopSession, stopRecording]);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleTextSubmit = useCallback(
    (text: string) => {
      if (isSessionActive) {
        addTranscript(text, "user");
        sendText(text);
      }
    },
    [isSessionActive, sendText, addTranscript]
  );

  return (
    <div className="app-container">
      <header className="app-header" role="banner">
        <h1 className="app-title">
          <span className="title-icon" aria-hidden="true">&#9790;</span>
          AccessVoice
        </h1>
        <p className="app-subtitle">Voice-driven web browsing for everyone</p>
        <StatusIndicator
          status={status}
          isConnected={isConnected}
          isRecording={isRecording}
        />
      </header>

      <main className="app-main" role="main">
        <div className="panel-left">
          <BrowserView screenshot={screenshot} />
        </div>

        <div className="panel-right">
          <TranscriptPanel transcripts={transcripts} />
          <TextInput
            onSubmit={handleTextSubmit}
            disabled={!isSessionActive}
            placeholder={
              isSessionActive
                ? "Type a command or question..."
                : "Start a session first"
            }
          />
        </div>
      </main>

      <footer className="app-footer" role="contentinfo">
        <VoiceControls
          isSessionActive={isSessionActive}
          isRecording={isRecording}
          isConnected={isConnected}
          onToggleSession={handleToggleSession}
          onToggleRecording={handleToggleRecording}
        />
      </footer>
    </div>
  );
}

export default App;
