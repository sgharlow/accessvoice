interface StatusIndicatorProps {
  status: string;
  isConnected: boolean;
  isRecording: boolean;
}

export default function StatusIndicator({
  status,
  isConnected,
  isRecording,
}: StatusIndicatorProps) {
  const dotClass = isRecording
    ? "status-dot recording"
    : isConnected
    ? "status-dot connected"
    : "status-dot disconnected";

  return (
    <div className="status-indicator" role="status" aria-live="polite">
      <span className={dotClass} aria-hidden="true" />
      <span className="status-text">{status}</span>
    </div>
  );
}
