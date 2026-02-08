# AccessVoice — Voice-Driven Web Browser for Accessibility

AccessVoice lets visually impaired users browse the web through natural voice conversation. Instead of navigating with a screen reader and keyboard shortcuts, users simply say what they want — "Search for apartments in Seattle on Zillow" — and AccessVoice handles the browsing, reading, and navigation automatically.

Built with three Amazon Nova models working together: **Nova Sonic** for real-time bidirectional voice, **Nova Act** for autonomous browser control, and **Nova 2 Lite** for page understanding.

## Architecture

```
User (Voice/Text)
      |
  React Frontend ──── Socket.IO ──── FastAPI Backend
      |                                    |
  Audio Playback                     Nova Sonic BidiAgent
  Browser View                       (us-east-1, real-time voice)
  Transcript Log                           |
                                     Tool Calls:
                                       ├── browse_website (Nova Act)
                                       ├── read_page (Nova 2 Lite, us-west-2)
                                       ├── refine_search (Nova Act)
                                       └── navigate_back (Nova Act)
                                           |
                                     Audio + Transcript + Screenshot
                                       → Socket.IO → Frontend → User
```

See [architecture.md](architecture.md) for a detailed Mermaid diagram.

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

5. **Start a voice session** — click the session button or press `Ctrl+Shift+S`, then speak naturally.

## Deploy to EC2

For production deployment on an EC2 instance (t3.xlarge recommended):

```bash
# SSH into your instance, then:
bash deploy/ec2-setup.sh
```

This script installs Docker, clones the repo, builds production images, and starts the app on port 80. See [deploy/](deploy/) for details.

## Demo Scenarios

1. **Real estate search**: "Search for apartments in Seattle on Zillow under $2000 a month"
2. **Online shopping**: "Find me a winter jacket on Amazon under $100"
3. **News browsing**: "What's the latest news on CNN?"

Each scenario demonstrates voice-driven browsing, page reading, search refinement, and navigation — all without touching a keyboard or mouse.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Start/stop voice session |
| `Ctrl+Shift+M` | Toggle microphone |
| `Ctrl+Shift+T` | Focus text input |

## Tech Stack

- **Backend**: Python 3.12, FastAPI, python-socketio, Strands SDK, Nova Act SDK
- **Frontend**: React 18, TypeScript, Vite, Socket.IO client
- **Infrastructure**: Docker, Nginx, WebSocket proxying
- **AI Models**: Amazon Nova Sonic, Nova Act, Nova 2 Lite

## Project Structure

```
accessvoice/
├── backend/
│   ├── agents/voice_agent.py    # BidiAgent orchestration
│   ├── tools/                   # browse, read, refine, navigate
│   ├── services/                # Session management, screenshot streaming
│   ├── prompts/                 # System prompt for voice persona
│   ├── config.py                # AWS regions, model IDs, voice settings
│   └── main.py                  # FastAPI + Socket.IO server
├── frontend/
│   ├── src/
│   │   ├── components/          # VoiceControls, BrowserView, Transcript, etc.
│   │   ├── hooks/               # useSocketIO, useAudioStream
│   │   └── App.tsx              # Main app layout
│   └── package.json
├── deploy/
│   ├── nginx.conf               # Reverse proxy + WebSocket + gzip
│   ├── Dockerfile.nginx         # Multi-stage: build frontend + serve
│   └── ec2-setup.sh             # One-command EC2 deployment
├── docker-compose.yml           # Local development
├── docker-compose.prod.yml      # Production (Nginx + backend, no dev volumes)
└── .env.example
```

## License

MIT
