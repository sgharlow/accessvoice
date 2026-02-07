import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "../App";

interface TranscriptPanelProps {
  transcripts: TranscriptEntry[];
}

export default function TranscriptPanel({ transcripts }: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  return (
    <div
      className="transcript-panel"
      role="log"
      aria-label="Conversation transcript"
      aria-live="polite"
    >
      {transcripts.length === 0 ? (
        <p className="transcript-empty">
          Conversation will appear here...
        </p>
      ) : (
        transcripts.map((entry, i) => (
          <div
            key={i}
            className={`transcript-entry transcript-${entry.role}`}
            role="listitem"
          >
            <span className="transcript-role" aria-hidden="true">
              {entry.role === "user"
                ? "You"
                : entry.role === "assistant"
                ? "AccessVoice"
                : "System"}
            </span>
            <span className="transcript-text">{entry.text}</span>
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
