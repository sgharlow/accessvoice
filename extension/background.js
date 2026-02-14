// extension/background.js
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
let socket = null;
let currentSessionId = null;

// --- Offscreen Document Management ---

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK", "USER_MEDIA"],
      justification: "Microphone capture and audio playback for voice assistant",
    });
  }
}

// --- Socket.IO Connection ---

function connectToBackend() {
  if (socket?.connected) return;

  socket = io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    broadcastToSidepanel({ type: "connection_status", connected: true });
  });

  socket.on("disconnect", () => {
    broadcastToSidepanel({ type: "connection_status", connected: false });
  });

  // Forward server events to sidepanel
  for (const event of ["transcript", "audio", "status", "screenshot",
                        "session_started", "session_stopped", "error"]) {
    socket.on(event, (data) => {
      broadcastToSidepanel({ type: event, data });
    });
  }

  // Handle audio events — forward to offscreen document for playback
  socket.on("audio", (data) => {
    chrome.runtime.sendMessage({ type: "play_audio", data: data.audio || data.data });
  });

  // Handle extension-specific events from backend
  socket.on("request_screenshot", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        socket.emit("page_screenshot", { image: null, url: "", title: "", error: "No active tab" });
        return;
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 });
      const base64 = dataUrl.split(",")[1];
      socket.emit("page_screenshot", {
        image: base64,
        url: tab.url,
        title: tab.title,
      });
    } catch (err) {
      socket.emit("page_screenshot", { image: null, url: "", title: "", error: err.message });
    }
  });

  socket.on("execute_action", async (data) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        socket.emit("action_result", { success: false, error: "No active tab" });
        return;
      }

      if (data.action === "navigate") {
        await chrome.tabs.update(tab.id, { url: data.params.url });
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 15000);
        });
        socket.emit("action_result", { success: true });
      } else {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "execute_action",
          action: data.action,
          params: data.params,
        });
        socket.emit("action_result", response || { success: false, error: "No response from content script" });
      }
    } catch (err) {
      socket.emit("action_result", { success: false, error: err.message });
    }
  });
}

// --- Sidepanel Communication ---

function broadcastToSidepanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// Handle messages from sidepanel and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "connect") {
    ensureOffscreen().then(() => connectToBackend());
    sendResponse({ ok: true });
  } else if (message.type === "start_session") {
    socket?.emit("start_session");
  } else if (message.type === "stop_session") {
    socket?.emit("stop_session");
  } else if (message.type === "text_input") {
    socket?.emit("text_input", { text: message.text });
  } else if (message.type === "audio_chunk") {
    socket?.emit("audio_chunk", { data: message.data });
  }
  return true;
});

// Open sidepanel when extension icon clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Configure on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
