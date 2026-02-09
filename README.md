# AccessVoice — Voice-Driven Web Browser for Accessibility

AccessVoice lets visually impaired users browse the web through natural voice conversation. Instead of navigating with a screen reader and keyboard shortcuts, users simply say what they want — "Search for apartments in Seattle on Zillow" — and AccessVoice handles the browsing, reading, and navigation automatically.

Built with three Amazon Nova models working together: **Nova Sonic** for real-time bidirectional voice, **Nova Act** for autonomous browser control, and **Nova 2 Lite** for page understanding.

> **Hackathon**: [Amazon Nova AI Hackathon](https://amazon-nova.devpost.com) | **Category**: Best Voice AI, Best UI Automation

## Demo

[Watch the demo video](#) <!-- Replace with Devpost/YouTube link after upload -->

The demo shows three real browsing scenarios — apartment search on Zillow, shopping on Amazon, and reading news on CNN — all driven by voice commands through the AccessVoice interface.

## Architecture

```
User (Voice/Text)
      │
  React Frontend ──── Socket.IO ──── FastAPI Backend
      │                                    │
  Audio Playback                     Nova Sonic BidiAgent
  Browser View                       (us-east-1, real-time voice)
  Transcript Log                           │
                                     Tool Calls:
                                       ├── browse_website (Nova Act)
                                       ├── read_page (Nova 2 Lite, us-west-2)
                                       ├── refine_search (Nova Act)
                                       └── navigate_back (Nova Act)
                                           │
                                     Audio + Transcript + Screenshot
                                       → Socket.IO → Frontend → User
```

See [architecture.md](architecture.md) for detailed Mermaid diagrams including data flow sequence.

## Nova Models Used

| Model | Role | Region |
|-------|------|--------|
| **Nova 2 Sonic** | Real-time bidirectional voice conversation via Strands BidiAgent | us-east-1 |
| **Nova Act** | Autonomous browser navigation — click, type, scroll, search | us-east-1 |
| **Nova 2 Lite** | Vision-based page content understanding from screenshots | us-west-2 |

**Orchestration**: AWS Strands SDK — BidiAgent handles real-time audio streaming with async tool calling mid-conversation.

## Quick Start (Local Development)

### Prerequisites
- Docker and Docker Compose
- AWS account with Bedrock access (Nova Sonic in us-east-1, Nova 2 Lite in us-west-2)
- Nova Act API key from [nova.amazon.com/act](https://nova.amazon.com/act)

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/sgharlow/accessvoice.git
   cd accessvoice
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your AWS credentials and Nova Act API key
   ```

3. **Start with Docker Compose**
   ```bash
   docker compose up --build
   ```

4. **Open the app**
   ```
   http://localhost:5173
   ```

5. **Start a voice session** — click the session button or press `Ctrl+Shift+S`, then speak naturally or type a command.

## Deploy to EC2

For production deployment on an EC2 instance (t3.xlarge recommended):

```bash
# SSH into your instance, then:
bash deploy/ec2-setup.sh
```

This installs Docker, clones the repo, builds production images (Nginx + backend), and starts the app on port 80. See [deploy/](deploy/) for Nginx config and Dockerfile.

## Demo Scenarios

1. **Real estate search**: "Search for apartments in Seattle on Zillow under $2000 a month"
2. **Online shopping**: "Find me a winter jacket on Amazon under $100"
3. **News browsing**: "What's the latest news on CNN?"

Each scenario demonstrates voice-driven browsing, live screenshot streaming, page reading, and natural voice responses — all without touching a keyboard or mouse.

## Testing

The project includes automated end-to-end tests covering all demo scenarios and system behavior:

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

Accessibility audit: 0 WCAG violations verified via axe-core (38 rules checked).

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Start/stop voice session |
| `Ctrl+Shift+M` | Toggle microphone |
| `Ctrl+Shift+T` | Focus text input |

## Tech Stack

- **Backend**: Python 3.12, FastAPI, python-socketio, Strands SDK, Nova Act SDK, boto3
- **Frontend**: React 18, TypeScript, Vite, Socket.IO client
- **Infrastructure**: Docker, Nginx, Xvfb (virtual display for Chrome)
- **AI Models**: Amazon Nova 2 Sonic, Nova Act, Nova 2 Lite
- **Testing**: Custom E2E suite (Socket.IO + Playwright), axe-core accessibility audit

## Project Structure

```
accessvoice/
├── backend/
│   ├── agents/voice_agent.py    # BidiAgent orchestration + event loop
│   ├── tools/                   # browse_website, read_page, refine_search, navigate_back
│   ├── services/                # Session management, screenshot streaming
│   ├── prompts/                 # System prompt for accessible voice persona
│   ├── config.py                # AWS regions, model IDs, audio settings
│   └── main.py                  # FastAPI + Socket.IO server
├── frontend/
│   ├── src/
│   │   ├── components/          # VoiceControls, BrowserView, TranscriptPanel, etc.
│   │   ├── hooks/               # useSocketIO, useAudioStream
│   │   └── App.tsx              # Main app with AudioQueue playback
│   └── package.json
├── deploy/
│   ├── nginx.conf               # Reverse proxy + WebSocket + gzip
│   ├── Dockerfile.nginx          # Multi-stage: build frontend + serve static
│   └── ec2-setup.sh             # One-command EC2 provisioning
├── tests/                       # E2E test suite (7 test files)
├── docker-compose.yml           # Local development
├── docker-compose.prod.yml      # Production (Nginx + backend)
└── .env.example
```

## Judge Access

If reviewing this submission, the repo is accessible to:
- `testing@devpost.com`
- `Amazon-Nova-hackathon@amazon.com`

## License

MIT
