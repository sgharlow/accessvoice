# AccessVoice Browser Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rearchitect AccessVoice from a cloud-hosted browser to a Chrome extension that uses the user's own browser, eliminating bot detection issues while keeping Nova Sonic (voice) and Nova 2 Lite (vision) on the backend.

**Architecture:** The Chrome extension captures screenshots and executes DOM actions on the user's active tab. A slimmed-down backend server handles Nova Sonic voice streaming and Nova 2 Lite vision analysis. A new "Action Planner" tool replaces Nova Act — it receives screenshots from the extension, uses Nova 2 Lite to determine what browser actions to take, and sends structured commands back to the extension for execution.

**Tech Stack:** Chrome Extension (Manifest V3), React 18 (sidepanel UI), Socket.IO (extension ↔ backend), FastAPI (backend), Nova 2 Sonic (voice), Nova 2 Lite (vision + action planning), Python 3.12

---

## Architecture Overview

```
Chrome Extension
  ├─ Sidepanel (React)     — UI: transcript, controls, browser view
  ├─ Service Worker         — Socket.IO to backend, chrome.tabs API
  ├─ Offscreen Document     — Mic capture + audio playback (Web Audio API)
  └─ Content Script         — Execute actions on user's active tab

Backend Server (no Docker/Playwright/Xvfb)
  ├─ FastAPI + Socket.IO    — Same server, slimmed down
  ├─ Nova 2 Sonic           — Voice conversation (unchanged)
  ├─ Nova 2 Lite            — Page analysis (kept) + Action planning (new)
  └─ Action Planner tool    — Replaces Nova Act with vision-based planning
```

## New Socket.IO Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `request_screenshot` | server → ext | `{}` | Ask extension to capture current tab |
| `page_screenshot` | ext → server | `{image: str, url: str, title: str}` | Screenshot response |
| `execute_action` | server → ext | `{action: str, params: obj}` | Tell extension to click/type/scroll/navigate |
| `action_result` | ext → server | `{success: bool, error?: str}` | Action execution result |

## File Structure (new extension directory)

```
extension/
  manifest.json
  background.js          — Service worker
  offscreen.html         — Offscreen document HTML
  offscreen.js           — Audio I/O logic
  content.js             — DOM action executor
  sidepanel/             — React app (built from frontend/src)
    index.html
    ... (Vite build output)
```

---

## Phase 1: Chrome Extension Shell

### Task 1: Create Extension Manifest and Structure

**Files:**
- Create: `extension/manifest.json`

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "AccessVoice",
  "version": "1.0.0",
  "description": "Voice-driven web browsing for accessibility",
  "permissions": [
    "activeTab",
    "tabs",
    "scripting",
    "sidePanel",
    "offscreen",
    "storage"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "Open AccessVoice"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Step 2: Create placeholder icon**

Run: `mkdir -p extension/icons`

Use a simple generated icon (or copy from frontend public/).

**Step 3: Verify manifest loads**

Run: Open `chrome://extensions`, enable Developer mode, "Load unpacked" → select `extension/` directory. Verify no manifest errors.

**Step 4: Commit**

```bash
git add extension/manifest.json extension/icons/
git commit -m "feat: add Chrome extension manifest (Manifest V3)"
```

---

### Task 2: Create Service Worker (Background Script)

**Files:**
- Create: `extension/background.js`

**Step 1: Write the service worker**

The service worker manages:
- Socket.IO connection to backend
- Screenshot capture via chrome.tabs API
- Message routing between sidepanel, content script, and backend

```javascript
// extension/background.js
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
let socket = null;
let currentSessionId = null;

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

  // Handle extension-specific events from backend
  socket.on("request_screenshot", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        socket.emit("page_screenshot", { image: null, url: "", title: "", error: "No active tab" });
        return;
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 });
      // Remove data:image/jpeg;base64, prefix
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
        // Wait for page load
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
        // Delegate click/type/scroll to content script
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

// Handle messages from sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "connect") {
    connectToBackend();
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
  return true; // keep channel open for async
});

// Open sidepanel when extension icon clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Connect on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
```

**Step 2: Bundle socket.io-client for the service worker**

The service worker needs socket.io-client bundled. Create a simple build:

Run:
```bash
cd extension
npm init -y
npm install socket.io-client
npx esbuild background.js --bundle --outfile=background.bundle.js --format=esm
```

Update manifest.json to use `background.bundle.js`.

**Step 3: Test service worker loads**

Reload extension in `chrome://extensions`. Check service worker status shows "Active". Check for console errors in service worker inspector.

**Step 4: Commit**

```bash
git add extension/background.js extension/package.json
git commit -m "feat: add extension service worker with Socket.IO + chrome.tabs"
```

---

### Task 3: Create Offscreen Document for Audio I/O

**Files:**
- Create: `extension/offscreen.html`
- Create: `extension/offscreen.js`

**Step 1: Create offscreen.html**

```html
<!DOCTYPE html>
<html>
<head><title>AccessVoice Audio</title></head>
<body>
  <script src="offscreen.js"></script>
</body>
</html>
```

**Step 2: Create offscreen.js**

This handles microphone capture and audio playback since service workers cannot access Web Audio API.

```javascript
// extension/offscreen.js

let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let isRecording = false;

// Audio playback queue (from App.tsx AudioQueue)
let playbackContext = null;
const audioQueue = [];
let isPlaying = false;

// --- Microphone Capture (from useAudioStream.ts) ---

async function startRecording() {
  if (isRecording) return;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(mediaStream);
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  scriptProcessor.onaudioprocess = (event) => {
    if (!isRecording) return;
    const float32 = event.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    // Send to service worker
    chrome.runtime.sendMessage({ type: "audio_chunk", data: base64 });
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
  isRecording = true;
}

function stopRecording() {
  isRecording = false;
  scriptProcessor?.disconnect();
  mediaStream?.getTracks().forEach((t) => t.stop());
  audioContext?.close();
  audioContext = null;
  mediaStream = null;
  scriptProcessor = null;
}

// --- Audio Playback (from App.tsx AudioQueue) ---

function playAudioChunk(base64Data) {
  if (!playbackContext) {
    playbackContext = new AudioContext({ sampleRate: 16000 });
  }

  const raw = atob(base64Data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  const view = new DataView(bytes.buffer);
  const samples = bytes.length / 2;
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }

  const buffer = playbackContext.createBuffer(1, samples, 16000);
  buffer.copyToChannel(float32, 0);

  audioQueue.push(buffer);
  if (!isPlaying) playNext();
}

function playNext() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const buffer = audioQueue.shift();
  const source = playbackContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackContext.destination);
  source.onended = playNext;
  source.start();
}

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "start_recording") {
    startRecording().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: e.message }));
    return true;
  } else if (message.type === "stop_recording") {
    stopRecording();
    sendResponse({ ok: true });
  } else if (message.type === "play_audio") {
    playAudioChunk(message.data);
    sendResponse({ ok: true });
  }
});
```

**Step 3: Add offscreen document creation to service worker**

Add to `background.js` (before `connectToBackend`):

```javascript
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
```

Call `ensureOffscreen()` in the `connect` message handler and forward `audio` events to the offscreen document for playback.

**Step 4: Commit**

```bash
git add extension/offscreen.html extension/offscreen.js
git commit -m "feat: add offscreen document for mic capture + audio playback"
```

---

### Task 4: Create Content Script for DOM Actions

**Files:**
- Create: `extension/content.js`

**Step 1: Write the content script**

The content script executes DOM actions on the user's active tab, replacing Nova Act.

```javascript
// extension/content.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "execute_action") return;

  const { action, params } = message;

  try {
    switch (action) {
      case "click": {
        // Find element by CSS selector, text content, or coordinates
        const el = findElement(params);
        if (!el) {
          sendResponse({ success: false, error: `Element not found: ${JSON.stringify(params)}` });
          return;
        }
        el.click();
        sendResponse({ success: true });
        break;
      }

      case "type": {
        const el = findElement(params);
        if (!el) {
          sendResponse({ success: false, error: `Element not found: ${JSON.stringify(params)}` });
          return;
        }
        el.focus();
        el.value = "";
        // Simulate realistic typing with input events
        for (const char of params.text) {
          el.value += char;
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (params.pressEnter) {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
          el.form?.submit();
        }
        sendResponse({ success: true });
        break;
      }

      case "scroll": {
        const amount = params.amount || 500;
        const direction = params.direction || "down";
        window.scrollBy({
          top: direction === "down" ? amount : -amount,
          behavior: "smooth",
        });
        sendResponse({ success: true });
        break;
      }

      case "get_page_info": {
        // Return page metadata for the action planner
        const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
          .slice(0, 20)
          .map((el, i) => ({
            index: i,
            tag: el.tagName.toLowerCase(),
            type: el.type || "",
            name: el.name || "",
            placeholder: el.placeholder || "",
            ariaLabel: el.getAttribute("aria-label") || "",
            value: el.value || "",
            selector: generateSelector(el),
          }));

        const links = Array.from(document.querySelectorAll("a[href]"))
          .slice(0, 30)
          .map((el, i) => ({
            index: i,
            text: el.textContent?.trim().slice(0, 100) || "",
            href: el.href,
            selector: generateSelector(el),
          }));

        const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"))
          .slice(0, 20)
          .map((el, i) => ({
            index: i,
            text: el.textContent?.trim().slice(0, 100) || el.value || "",
            ariaLabel: el.getAttribute("aria-label") || "",
            selector: generateSelector(el),
          }));

        sendResponse({
          success: true,
          data: {
            url: window.location.href,
            title: document.title,
            inputs,
            links,
            buttons,
          },
        });
        break;
      }

      case "back": {
        history.back();
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }

  return true; // async response
});

// --- Element Finding ---

function findElement(params) {
  if (params.selector) {
    return document.querySelector(params.selector);
  }
  if (params.text) {
    // Find by visible text content
    const xpath = `//*[contains(text(), '${params.text.replace(/'/g, "\\'")}')]`;
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue;
  }
  if (params.ariaLabel) {
    return document.querySelector(`[aria-label="${params.ariaLabel}"]`);
  }
  if (params.placeholder) {
    return document.querySelector(`[placeholder="${params.placeholder}"]`);
  }
  if (params.name) {
    return document.querySelector(`[name="${params.name}"]`);
  }
  return null;
}

// --- Selector Generation ---

function generateSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
  if (el.getAttribute("aria-label")) return `[aria-label="${el.getAttribute("aria-label")}"]`;
  // Fallback: nth-of-type
  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  const siblings = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
  const index = siblings.indexOf(el) + 1;
  return `${generateSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index})`;
}
```

**Step 2: Test content script injection**

Load extension, navigate to any website, open DevTools console on the page and verify content script loaded (check for AccessVoice in `chrome.runtime` context).

**Step 3: Commit**

```bash
git add extension/content.js
git commit -m "feat: add content script for DOM action execution"
```

---

### Task 5: Create Sidepanel UI

**Files:**
- Modify: `frontend/vite.config.ts` — add extension build config
- Create: `frontend/src/extension-main.tsx` — extension entry point
- Modify: `frontend/src/hooks/useSocketIO.ts` — add extension message bridge

**Step 1: Create extension entry point**

The sidepanel reuses existing React components but communicates via `chrome.runtime.sendMessage` instead of direct Socket.IO.

```typescript
// frontend/src/extension-main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/accessibility.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App useExtensionBridge={true} />
  </StrictMode>
);
```

**Step 2: Add extension bridge to useSocketIO**

Modify `useSocketIO.ts` to support two modes: direct Socket.IO (for dev) or Chrome extension messaging (for production extension).

In extension mode, instead of creating a Socket.IO client, it sends/receives messages via `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`.

**Step 3: Add Vite build config for extension**

Add a build script to package.json:
```json
"build:extension": "vite build --config vite.config.extension.ts"
```

Create `vite.config.extension.ts` that outputs to `../extension/sidepanel/`.

**Step 4: Build and test sidepanel**

Run: `cd frontend && npm run build:extension`

Reload extension, click icon, verify sidepanel opens with the AccessVoice UI.

**Step 5: Commit**

```bash
git add frontend/src/extension-main.tsx frontend/vite.config.extension.ts
git commit -m "feat: add sidepanel UI with extension message bridge"
```

---

## Phase 2: Backend Changes

### Task 6: Create Action Planner Tool

**Files:**
- Create: `backend/tools/action_planner.py`

**Step 1: Write the action planner**

This tool replaces Nova Act. It receives a screenshot + page info from the extension, uses Nova 2 Lite to determine what action to take, and returns a structured command.

```python
# backend/tools/action_planner.py
"""
Action Planner — replaces Nova Act with vision-based browser action planning.

Given a screenshot of the user's browser tab and their intent,
uses Nova 2 Lite to determine what DOM action to execute next.
Returns structured action commands for the extension content script.
"""

import json
import base64
import boto3
import logging
from config import NOVA_LITE_REGION, NOVA_LITE_MODEL_ID

logger = logging.getLogger(__name__)

ACTION_PLANNER_PROMPT = """You are a browser automation assistant. Given a screenshot of a webpage and the user's goal, determine the SINGLE next action to take.

User's goal: {goal}
Current URL: {url}
Page title: {title}

Available page elements:
{page_info}

Respond with ONLY a JSON object (no markdown, no explanation) in one of these formats:

To navigate to a URL:
{{"action": "navigate", "params": {{"url": "https://..."}}}}

To click an element:
{{"action": "click", "params": {{"selector": "CSS selector"}}}}

To type text into an input:
{{"action": "type", "params": {{"selector": "CSS selector", "text": "text to type", "pressEnter": true}}}}

To scroll the page:
{{"action": "scroll", "params": {{"direction": "down", "amount": 500}}}}

To go back:
{{"action": "back", "params": {{}}}}

If the goal is complete (results are visible), respond:
{{"action": "done", "params": {{"summary": "Brief description of what was found"}}}}

Choose the most effective single action to make progress toward the goal."""


_bedrock_client = None

def _get_bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client("bedrock-runtime", region_name=NOVA_LITE_REGION)
    return _bedrock_client


def plan_action(screenshot_b64: str, goal: str, url: str = "", title: str = "", page_info: str = "") -> dict:
    """
    Analyze screenshot and determine next browser action.

    Args:
        screenshot_b64: Base64-encoded JPEG screenshot
        goal: User's browsing intent
        url: Current page URL
        title: Current page title
        page_info: JSON string of available page elements

    Returns:
        dict with 'action' and 'params' keys
    """
    bedrock = _get_bedrock()
    screenshot_bytes = base64.b64decode(screenshot_b64)

    prompt = ACTION_PLANNER_PROMPT.format(
        goal=goal,
        url=url,
        title=title,
        page_info=page_info or "Not available",
    )

    try:
        response = bedrock.converse(
            modelId=NOVA_LITE_MODEL_ID,
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": "jpeg", "source": {"bytes": screenshot_bytes}}},
                    {"text": prompt},
                ],
            }],
            inferenceConfig={"maxTokens": 500, "temperature": 0.1},
        )

        result_text = response["output"]["message"]["content"][0]["text"].strip()

        # Parse JSON from response (handle markdown code blocks)
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
            result_text = result_text.strip()

        action = json.loads(result_text)
        logger.info(f"Action planned: {action['action']} for goal: {goal[:50]}")
        return action

    except Exception as e:
        logger.error(f"Action planning failed: {e}")
        return {"action": "done", "params": {"summary": f"I had trouble analyzing the page: {str(e)}"}}
```

**Step 2: Test action planner with a sample screenshot**

Run: `python -c "from tools.action_planner import plan_action; ..."`

**Step 3: Commit**

```bash
git add backend/tools/action_planner.py
git commit -m "feat: add action planner tool (replaces Nova Act)"
```

---

### Task 7: Create Browse Tool Using Extension

**Files:**
- Create: `backend/tools/browse_extension.py`

**Step 1: Write the extension-based browse tool**

This is the Strands tool that the voice agent calls. It orchestrates the screenshot → plan → execute loop via Socket.IO messages to the extension.

```python
# backend/tools/browse_extension.py
"""
Browse tool that works with the Chrome extension instead of Nova Act.
Orchestrates: request screenshot → plan action → execute action → repeat.
"""

import asyncio
import logging
import json
from strands import tool
from tools.action_planner import plan_action

logger = logging.getLogger(__name__)

MAX_STEPS = 10
STEP_TIMEOUT = 30  # seconds per step


@tool
def browse_website(url: str, task: str) -> str:
    """
    Navigate to a website and perform a task using the user's browser.

    Args:
        url: The website URL to navigate to
        task: What to do on the website (e.g., "search for apartments in Seattle")

    Returns:
        A summary of what was found or accomplished
    """
    import threading
    ctx = threading.current_thread().__dict__

    session_id = ctx.get("session_id", "")
    emit_to_client = ctx.get("emit_to_client")
    on_status = ctx.get("on_status")
    on_screenshot = ctx.get("on_screenshot")

    if not emit_to_client:
        return "Error: No connection to browser extension"

    if on_status:
        on_status(f"Navigating to {url}...")

    # Step 1: Navigate to the URL
    result = _execute_and_wait(emit_to_client, {
        "action": "navigate",
        "params": {"url": url},
    })

    if not result.get("success"):
        return f"Failed to navigate to {url}: {result.get('error', 'unknown error')}"

    # Step 2: Iterative action loop
    goal = task
    for step in range(MAX_STEPS):
        if on_status:
            on_status(f"Step {step + 1}: analyzing page...")

        # Request screenshot from extension
        screenshot_data = _request_screenshot(emit_to_client)
        if not screenshot_data or not screenshot_data.get("image"):
            return "Failed to capture screenshot from browser"

        if on_screenshot:
            on_screenshot(screenshot_data["image"])

        # Request page info from extension
        page_info = _request_page_info(emit_to_client)
        page_info_str = json.dumps(page_info.get("data", {}), indent=2) if page_info else ""

        # Plan next action
        if on_status:
            on_status(f"Step {step + 1}: deciding next action...")

        action = plan_action(
            screenshot_b64=screenshot_data["image"],
            goal=goal,
            url=screenshot_data.get("url", ""),
            title=screenshot_data.get("title", ""),
            page_info=page_info_str,
        )

        logger.info(f"Step {step + 1}: {action}")

        if action["action"] == "done":
            # Take final screenshot
            if on_screenshot:
                on_screenshot(screenshot_data["image"])
            return action["params"].get("summary", "Task completed")

        if on_status:
            action_desc = _describe_action(action)
            on_status(f"Step {step + 1}: {action_desc}")

        # Execute the action
        result = _execute_and_wait(emit_to_client, action)
        if not result.get("success"):
            logger.warning(f"Action failed: {result.get('error')}")
            # Continue trying — the planner will see the unchanged page

        # Brief pause for page to update
        import time
        time.sleep(2)

    return "Reached maximum steps. Here's what I found so far based on the page."


def _execute_and_wait(emit_to_client, action, timeout=STEP_TIMEOUT):
    """Send action to extension and wait for result."""
    result_event = asyncio.Event()
    result_data = {}

    def on_result(data):
        result_data.update(data)
        result_event.set()

    emit_to_client("execute_action", action, callback=on_result)

    # Wait synchronously (we're in a tool thread)
    import time
    start = time.time()
    while not result_event.is_set() and (time.time() - start) < timeout:
        time.sleep(0.1)

    return result_data if result_event.is_set() else {"success": False, "error": "timeout"}


def _request_screenshot(emit_to_client, timeout=10):
    """Request screenshot from extension."""
    result_event = asyncio.Event()
    result_data = {}

    def on_screenshot(data):
        result_data.update(data)
        result_event.set()

    emit_to_client("request_screenshot", {}, callback=on_screenshot)

    import time
    start = time.time()
    while not result_event.is_set() and (time.time() - start) < timeout:
        time.sleep(0.1)

    return result_data if result_event.is_set() else None


def _request_page_info(emit_to_client, timeout=5):
    """Request page element info from extension content script."""
    result_event = asyncio.Event()
    result_data = {}

    def on_info(data):
        result_data.update(data)
        result_event.set()

    emit_to_client("execute_action", {"action": "get_page_info", "params": {}}, callback=on_info)

    import time
    start = time.time()
    while not result_event.is_set() and (time.time() - start) < timeout:
        time.sleep(0.1)

    return result_data if result_event.is_set() else None


def _describe_action(action):
    """Human-readable description of an action."""
    a = action["action"]
    p = action.get("params", {})
    if a == "navigate":
        return f"navigating to {p.get('url', '?')}"
    if a == "click":
        return f"clicking {p.get('selector', p.get('text', '?'))}"
    if a == "type":
        return f"typing '{p.get('text', '?')}'"
    if a == "scroll":
        return f"scrolling {p.get('direction', 'down')}"
    if a == "back":
        return "going back"
    return a
```

**Step 2: Commit**

```bash
git add backend/tools/browse_extension.py
git commit -m "feat: add extension-based browse tool with action loop"
```

---

### Task 8: Update Voice Agent and Config

**Files:**
- Modify: `backend/agents/voice_agent.py`
- Modify: `backend/config.py`
- Modify: `backend/main.py`

**Step 1: Update config.py**

- Remove Nova Act config (lines 26, 28-39)
- Update SYSTEM_PROMPT to remove references to Nova Act tools and add extension-aware descriptions
- Add `CORS_ORIGINS` entry for chrome-extension:// protocol

**Step 2: Update voice_agent.py**

- Replace `from tools.browse_website import browse_website` → `from tools.browse_extension import browse_website`
- Remove imports: `refine_search`, `navigate_back`
- Remove `cleanup_browser` call from `close()` method
- Update tool list: `[browse_website, read_page, stop_conversation]`
- Remove `_TOOL_LABELS` entries for refine/navigate

**Step 3: Update main.py**

- Add new Socket.IO event handlers for extension communication
- Add `emit_to_client` helper that tools can use to send messages to the extension
- Pass `emit_to_client` to voice agent context

**Step 4: Test backend starts without Nova Act**

Run: `cd backend && pip install -r requirements.txt && python -c "from agents.voice_agent import VoiceAgent; print('OK')"`

**Step 5: Commit**

```bash
git add backend/config.py backend/agents/voice_agent.py backend/main.py
git commit -m "feat: update backend to use extension-based browsing (remove Nova Act)"
```

---

### Task 9: Update Requirements and Remove Docker Dependencies

**Files:**
- Modify: `backend/requirements.txt` — remove nova-act, playwright
- Delete: `backend/Dockerfile` (or keep for backend-only container)
- Delete: `backend/entrypoint.sh` (no more Xvfb)
- Modify: `docker-compose.yml` — simplify to backend-only

**Step 1: Update requirements.txt**

Remove:
- `nova-act>=3.0`
- `playwright`

Keep:
- `strands-agents>=1.2.0`
- `strands-agents-tools>=0.1.0`
- `boto3`
- `fastapi`
- `python-socketio`
- `uvicorn[standard]`
- `python-dotenv`
- `Pillow`

**Step 2: Create simple run script**

```bash
# run_backend.sh
#!/bin/bash
cd backend
pip install -r requirements.txt
uvicorn main:combined_asgi_app --host 0.0.0.0 --port 8000
```

**Step 3: Commit**

```bash
git add backend/requirements.txt run_backend.sh
git commit -m "chore: remove Nova Act/Playwright deps, add simple run script"
```

---

## Phase 3: Integration and Testing

### Task 10: End-to-End Integration Test

**Step 1: Start backend**

Run: `cd backend && uvicorn main:combined_asgi_app --host 0.0.0.0 --port 8000`

**Step 2: Build and load extension**

Run: `cd frontend && npm run build:extension`

Load extension in Chrome, open sidepanel.

**Step 3: Test connection**

Verify sidepanel shows "Connected to server".

**Step 4: Test scenario — CNN News**

1. Navigate to cnn.com in a regular browser tab
2. In AccessVoice sidepanel, start session
3. Type: "What's the latest news on this page?"
4. Verify: screenshot captured, Nova 2 Lite analyzes, transcript shows news summary

**Step 5: Test scenario — Amazon Shopping**

1. Navigate to amazon.com
2. Type: "Search for winter jackets under $100"
3. Verify: action planner types in search box, filters results, returns summary

**Step 6: Test scenario — Apartments.com**

1. Navigate to apartments.com (no Access Denied since it's YOUR browser!)
2. Type: "Search for 2 bedroom apartments in Seattle"
3. Verify: works without bot detection

---

### Task 11: Re-record Demo Video

**Step 1: Update record_demo.mjs**

Replace Playwright-based recording with manual screen recording instructions or use a screen recorder that captures the extension + browser interaction.

Alternatively, use Playwright to open Chrome with the extension loaded:
```bash
npx playwright chromium --load-extension=./extension
```

**Step 2: Record all 3 scenarios with working results**

**Step 3: Re-narrate with generate_narration.mjs**

**Step 4: Upload to YouTube with #AmazonNova**

---

### Task 12: Update Submission Materials

**Files:**
- Modify: `README.md` — update architecture description
- Modify: `SUBMISSION.md` — update to reflect extension architecture
- Modify: `architecture.md` — new Mermaid diagrams

**Step 1: Update README**

Replace "cloud browser" references with "Chrome extension" architecture.

**Step 2: Update SUBMISSION.md**

Move the "Production Vision" section to "Current Architecture" — this IS the production architecture now.

**Step 3: Commit and push**

```bash
git add -A
git commit -m "docs: update submission materials for browser extension architecture"
git push origin main
```

---

## Estimated Timeline

| Phase | Tasks | Estimated Time |
|-------|-------|---------------|
| Phase 1: Extension Shell | Tasks 1-5 | 1.5 days |
| Phase 2: Backend Changes | Tasks 6-9 | 1 day |
| Phase 3: Integration + Demo | Tasks 10-12 | 1.5 days |
| **Total** | **12 tasks** | **~4 days** |

## Risk Mitigation

1. **Nova 2 Lite action planning quality** — If vision-based action planning is unreliable, fall back to structured page info (DOM elements, links, buttons) instead of screenshots for action decisions.

2. **Service worker idle timeout** — Chrome kills service workers after 5 min idle. Use keepalive via `chrome.alarms` API or move Socket.IO to the sidepanel context (which persists while open).

3. **Content script injection timing** — Content scripts may not be injected on all pages (chrome://, extension pages). Add error handling for these cases.

4. **Hackathon scoring** — Removing Nova Act drops from 3 Nova models to 2. Mitigate by emphasizing the deeper integration of Nova 2 Lite (now doing BOTH vision AND action planning) in submission text.
