# AccessVoice — Voice-Driven Web Browser for Accessibility

AccessVoice lets visually impaired users browse the web through natural voice conversation. Instead of navigating with a screen reader and keyboard shortcuts, users simply say what they want — "Search for apartments in Seattle" — and AccessVoice handles the browsing, reading, and navigation automatically.

Built as a **Chrome Extension** powered by two Amazon Nova models working together: **Nova Sonic** for real-time bidirectional voice and **Nova 2 Lite** for page understanding and action planning.

> **Hackathon**: [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com) | **Category**: Best Voice AI, Best UI Automation

## Demo

[Watch the demo video](#) <!-- Replace with Devpost/YouTube link after upload -->

The demo shows three real browsing scenarios — apartment search, shopping on Amazon, and reading news on CNN — all driven by voice commands through the AccessVoice Chrome Extension.

## Architecture

```
User (Voice/Text)
      │
  Chrome Extension
  ├── Sidepanel UI ────── Socket.IO ────── FastAPI Backend
  │   (React)                                    │
  ├── Content Script                       Nova Sonic BidiAgent
  │   (DOM actions)                        (us-east-1, real-time voice)
  ├── Service Worker                             │
  │   (orchestration)                      Tool Calls:
  └── Offscreen Doc                          ├── browse_website
      (audio I/O)                            │   ├── Action Planner (Nova 2 Lite)
                                             │   └── Extension executes actions
                                             └── read_page (Nova 2 Lite, us-west-2)
                                                 │
                                           Audio + Transcript + Screenshot
                                             → Socket.IO → Extension → User
```

See [architecture.md](architecture.md) for detailed Mermaid diagrams including data flow sequence.

## Nova Models Used

| Model | Role | Region |
|-------|------|--------|
| **Nova 2 Sonic** | Real-time bidirectional voice conversation via Strands BidiAgent | us-east-1 |
| **Nova 2 Lite** | Vision-based action planning + page content understanding from screenshots | us-west-2 |

**Orchestration**: AWS Strands SDK — BidiAgent handles real-time audio streaming with async tool calling mid-conversation.

## How It Works

1. The Chrome Extension opens a sidepanel with the AccessVoice UI
2. User speaks a command (or types it) — e.g., "Find winter jackets on Amazon under $100"
3. Nova Sonic processes the voice and triggers a `browse_website` tool call
4. The backend sends a screenshot request to the extension's content script
5. Nova 2 Lite analyzes the screenshot and plans the next action (click, type, scroll, navigate)
6. The extension executes the action in the user's own browser tab
7. Steps 4-6 repeat until the task is complete (up to 10 steps)
8. Nova 2 Lite summarizes the page content accessibly
9. Nova Sonic speaks the result back to the user

## Quick Start

### Prerequisites
- Chrome or Chromium-based browser
- Python 3.12+
- Node.js 18+
- AWS account with Bedrock access (Nova Sonic in us-east-1, Nova 2 Lite in us-west-2)

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/sgharlow/accessvoice.git
   cd accessvoice
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials
   ```

3. **Start the backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   python -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```

4. **Build the extension**
   ```bash
   # Build the sidepanel UI
   cd frontend
   npm install && npm run build:extension

   # Bundle the service worker
   cd ../extension
   npm install && npm run build
   ```

5. **Load the extension in Chrome**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select the `extension/` directory

6. **Use AccessVoice** — click the extension icon to open the sidepanel, start a session, and speak or type commands.

## Demo Scenarios

1. **Real estate search**: "Search for 2 bedroom apartments in Seattle on Apartments.com"
2. **Online shopping**: "Find me a winter jacket on Amazon under $100"
3. **News browsing**: "What's the latest news on CNN?"

Each scenario demonstrates voice-driven browsing, live screenshot streaming, page reading, and natural voice responses — all without touching a keyboard or mouse.

## Testing

```bash
# Run individual E2E tests (requires backend running on port 8000)
node tests/test_session_lifecycle.mjs    # Session start/stop/restart (7 checks)
node tests/test_concurrent_sessions.mjs  # Multi-user isolation (4 checks)
node tests/test_error_recovery.mjs       # Graceful error handling (2 checks)
node tests/test_read_page.mjs            # Nova 2 Lite vision analysis (2 checks)
node tests/test_amazon.mjs               # Amazon shopping scenario
node tests/test_cnn.mjs                  # CNN news scenario
node test_zillow.mjs                     # Zillow apartment search
```

The frontend follows WCAG accessibility best practices with ARIA roles, labels, and keyboard navigation throughout.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Start/stop voice session |
| `Ctrl+Shift+M` | Toggle microphone |
| `Ctrl+Shift+T` | Focus text input |

## Tech Stack

- **Extension**: Chrome Manifest V3 (service worker, content script, offscreen document, sidepanel)
- **Backend**: Python 3.12, FastAPI, python-socketio, Strands SDK, boto3
- **Frontend**: React 18, TypeScript, Vite, Socket.IO client
- **AI Models**: Amazon Nova 2 Sonic, Nova 2 Lite (via AWS Bedrock)
- **Testing**: Custom E2E suite (Socket.IO-based), Playwright (demo recording)

## Project Structure

```
accessvoice/
├── extension/
│   ├── manifest.json              # Chrome MV3 manifest (sidepanel, offscreen, content script)
│   ├── background.js              # Service worker — Socket.IO, screenshot relay, action dispatch
│   ├── content.js                 # Content script — DOM actions (click, type, scroll, screenshot)
│   ├── offscreen.html/js          # Audio I/O via Web Audio API
│   └── sidepanel/                 # Built React UI (from frontend/)
├── backend/
│   ├── agents/voice_agent.py      # BidiAgent orchestration + event loop
│   ├── tools/
│   │   ├── browse_extension.py    # Multi-step browsing via extension (screenshot → plan → act)
│   │   ├── action_planner.py      # Nova 2 Lite vision-based action planning
│   │   └── read_page.py           # Nova 2 Lite accessible page summaries
│   ├── services/                  # Session management
│   ├── config.py                  # AWS regions, model IDs, audio settings
│   └── main.py                    # FastAPI + Socket.IO server
├── frontend/
│   ├── src/
│   │   ├── components/            # VoiceControls, BrowserView, TranscriptPanel, etc.
│   │   ├── hooks/                 # useSocketIO (dual-mode), useAudioStream
│   │   └── App.tsx                # Main app with AudioQueue playback
│   └── index.extension.html       # Extension entry point
├── tests/                         # E2E test suite (6 test files)
├── deploy/                        # EC2 deployment (Nginx, Dockerfile, setup script)
├── demo-recording/                # Recorded demo video + narration
├── docs/plans/                    # Implementation plans
└── .env.example
```

## Why a Chrome Extension?

| Challenge | Cloud Browser | Chrome Extension |
|---|---|---|
| Bot detection / CAPTCHAs | Sites block cloud IPs | Non-issue — user's own browser |
| User authentication | No access to accounts | User's existing logins work |
| Cost per user | Server-side Chrome | Only AI inference costs |
| Banking/healthcare | Blocked (no auth) | Works — user's own sessions |
| Privacy | Pages on cloud server | Pages stay in user's browser |

## Repo Access for Judges

If reviewing this submission, the repo is accessible to:
- `testing@devpost.com`
- `Amazon-Nova-hackathon@amazon.com`

## License

MIT
