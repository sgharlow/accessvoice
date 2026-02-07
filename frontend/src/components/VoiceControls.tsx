interface VoiceControlsProps {
  isSessionActive: boolean;
  isRecording: boolean;
  isConnected: boolean;
  onToggleSession: () => void;
  onToggleRecording: () => void;
}

export default function VoiceControls({
  isSessionActive,
  isRecording,
  isConnected,
  onToggleSession,
  onToggleRecording,
}: VoiceControlsProps) {
  return (
    <div className="voice-controls" role="toolbar" aria-label="Voice controls">
      <button
        className={`btn btn-session ${isSessionActive ? "btn-stop" : "btn-start"}`}
        onClick={onToggleSession}
        disabled={!isConnected}
        aria-label={isSessionActive ? "End session" : "Start session"}
      >
        {isSessionActive ? "End Session" : "Start Session"}
      </button>

      {isSessionActive && (
        <button
          className={`btn btn-mic ${isRecording ? "btn-mic-active" : ""}`}
          onClick={onToggleRecording}
          aria-label={isRecording ? "Mute microphone" : "Unmute microphone"}
          aria-pressed={isRecording}
        >
          <span className="mic-icon" aria-hidden="true">
            {isRecording ? "\u{1F3A4}" : "\u{1F507}"}
          </span>
          {isRecording ? "Mute" : "Speak"}
        </button>
      )}

      {!isConnected && (
        <span className="controls-hint" role="alert">
          Connecting to server...
        </span>
      )}
    </div>
  );
}
