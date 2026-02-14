import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const isExtension = !!(window as any).__ACCESSVOICE_EXTENSION__;

interface UseSocketIOOptions {
  onTranscript: (text: string, role: "user" | "assistant" | "system") => void;
  onAudio: (audioB64: string) => void;
  onStatus: (message: string) => void;
  onScreenshot: (imageB64: string) => void;
  onSessionStarted: () => void;
  onSessionStopped: () => void;
  onError: (message: string) => void;
}

export function useSocketIO(options: UseSocketIOOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (isExtension) {
      // Extension mode: communicate via chrome.runtime messaging
      const listener = (message: any) => {
        switch (message.type) {
          case "connection_status":
            setIsConnected(message.connected);
            optionsRef.current.onStatus(
              message.connected ? "Connected to server" : "Disconnected from server"
            );
            break;
          case "transcript":
            optionsRef.current.onTranscript(message.data.text, message.data.role);
            break;
          case "audio":
            optionsRef.current.onAudio(message.data.data);
            break;
          case "status":
            optionsRef.current.onStatus(message.data.message);
            break;
          case "screenshot":
            optionsRef.current.onScreenshot(message.data.image);
            break;
          case "session_started":
            optionsRef.current.onSessionStarted();
            break;
          case "session_stopped":
            optionsRef.current.onSessionStopped();
            break;
          case "error":
            optionsRef.current.onError(message.data.message);
            break;
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      // Tell background to connect
      chrome.runtime.sendMessage({ type: "connect" });

      return () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
    } else {
      // Direct Socket.IO mode (dev / standalone)
      const socket = io({
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socket.on("connect", () => {
        setIsConnected(true);
        optionsRef.current.onStatus("Connected to server");
      });

      socket.on("disconnect", () => {
        setIsConnected(false);
        optionsRef.current.onStatus("Disconnected from server");
      });

      socket.on("transcript", (data: { text: string; role: string }) => {
        optionsRef.current.onTranscript(data.text, data.role as "user" | "assistant" | "system");
      });

      socket.on("audio", (data: { data: string }) => {
        optionsRef.current.onAudio(data.data);
      });

      socket.on("status", (data: { message: string }) => {
        optionsRef.current.onStatus(data.message);
      });

      socket.on("screenshot", (data: { image: string }) => {
        optionsRef.current.onScreenshot(data.image);
      });

      socket.on("session_started", () => {
        optionsRef.current.onSessionStarted();
      });

      socket.on("session_stopped", () => {
        optionsRef.current.onSessionStopped();
      });

      socket.on("error", (data: { message: string }) => {
        optionsRef.current.onError(data.message);
      });

      socketRef.current = socket;

      return () => {
        socket.disconnect();
      };
    }
  }, []);

  const startSession = useCallback(() => {
    if (isExtension) {
      chrome.runtime.sendMessage({ type: "start_session" });
    } else {
      socketRef.current?.emit("start_session", {});
    }
  }, []);

  const stopSession = useCallback(() => {
    if (isExtension) {
      chrome.runtime.sendMessage({ type: "stop_session" });
    } else {
      socketRef.current?.emit("stop_session", {});
    }
  }, []);

  const sendAudio = useCallback((audioB64: string) => {
    if (isExtension) {
      chrome.runtime.sendMessage({ type: "audio_chunk", data: audioB64 });
    } else {
      socketRef.current?.emit("audio_chunk", { data: audioB64 });
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (isExtension) {
      chrome.runtime.sendMessage({ type: "text_input", text });
    } else {
      socketRef.current?.emit("text_input", { text });
    }
  }, []);

  return { isConnected, startSession, stopSession, sendAudio, sendText };
}
