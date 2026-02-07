import { useState, useCallback } from "react";
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

function App() {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState("Disconnected");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);

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
        // Decode and play audio response
        playAudioResponse(audioB64);
      },
      onStatus: (message) => setStatus(message),
      onScreenshot: (imageB64) => setScreenshot(imageB64),
      onSessionStarted: () => {
        setIsSessionActive(true);
        setStatus("Listening...");
      },
      onSessionStopped: () => {
        setIsSessionActive(false);
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

function playAudioResponse(audioB64: string) {
  try {
    const audioBytes = Uint8Array.from(atob(audioB64), (c) => c.charCodeAt(0));
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    // Convert 16-bit PCM to Float32
    const float32 = new Float32Array(audioBytes.length / 2);
    const dataView = new DataView(audioBytes.buffer);
    for (let i = 0; i < float32.length; i++) {
      float32[i] = dataView.getInt16(i * 2, true) / 32768;
    }
    const buffer = audioCtx.createBuffer(1, float32.length, 16000);
    buffer.copyToChannel(float32, 0);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  } catch (e) {
    console.error("Failed to play audio:", e);
  }
}

export default App;
