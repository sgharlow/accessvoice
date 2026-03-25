# CLAUDE.md
This file provides guidance to Claude Code when working with this repository.

## Project Overview
AccessVoice is a voice-driven web browser for accessibility, built as a Chrome Extension powered by Amazon Nova models. Nova Sonic handles real-time bidirectional voice and Nova 2 Lite handles page understanding and action planning, letting visually impaired users browse the web through natural voice conversation.

## Tech Stack
- **Backend**: Python 3.12, FastAPI, python-socketio, AWS Strands SDK, boto3
- **Frontend**: React 18, TypeScript, Vite, Socket.IO client
- **Extension**: Chrome Manifest V3 (service worker, content script, offscreen document, sidepanel)
- **AI Models**: Amazon Nova 2 Sonic (us-east-1), Nova 2 Lite (us-west-2) via AWS Bedrock
- **Testing**: Custom E2E suite (Socket.IO-based), Playwright (demo recording)
- **Deployment**: EC2 (Nginx, Docker)

## Project Structure
```
accessvoice/
├── extension/
│   ├── manifest.json        # Chrome MV3 manifest
│   ├── background.js        # Service worker (Socket.IO, screenshot relay)
│   ├── content.js           # DOM actions (click, type, scroll, screenshot)
│   └── offscreen.html/js    # Audio I/O via Web Audio API
├── backend/
│   ├── main.py              # FastAPI + Socket.IO server
│   ├── agents/voice_agent.py # BidiAgent orchestration
│   ├── tools/               # browse_extension, action_planner, read_page
│   ├── services/            # Session management
│   └── config.py            # AWS regions, model IDs, audio settings
├── frontend/
│   ├── src/                 # React components, hooks, App.tsx
│   └── index.extension.html # Extension entry point
├── tests/                   # E2E test suite (6 test files)
├── deploy/                  # EC2 deployment (Nginx, Dockerfile)
├── demo-recording/          # Recorded demo video + narration
└── .env.example
```

## Development
```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (sidepanel)
cd frontend
npm install && npm run build:extension

# Extension service worker
cd extension
npm install && npm run build

# E2E tests (requires backend running on port 8000)
node tests/test_session_lifecycle.mjs
node tests/test_concurrent_sessions.mjs
node tests/test_error_recovery.mjs
node tests/test_read_page.mjs
```

## Key Information
- Requires AWS credentials with Bedrock access in us-east-1 (Nova Sonic) and us-west-2 (Nova 2 Lite)
- Built for the Amazon Nova AI Hackathon (submitted 2026-03-01)
- Keyboard shortcuts: Ctrl+Shift+S (start/stop), Ctrl+Shift+M (mic), Ctrl+Shift+T (text input)
- Uses Strands SDK BidiAgent for real-time audio streaming with async tool calling
- Architecture similar to accessbrowse but uses Amazon Nova instead of Google Gemini
