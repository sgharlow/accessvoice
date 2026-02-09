# AccessVoice — Devpost Submission

## Project Title
AccessVoice — Voice-Driven Web Browser for Accessibility

## One-Liner
A voice-first web browser that lets visually impaired users browse the internet through natural conversation, powered by three Amazon Nova models working in concert.

## What it does

AccessVoice replaces the traditional screen reader + keyboard navigation paradigm with natural voice conversation. Users speak commands like "Search for apartments in Seattle on Zillow" and AccessVoice autonomously browses the web, reads page content, refines searches, and reports results — all through real-time spoken dialogue.

The system combines three Nova models into a seamless experience:
- **Nova Sonic** handles bidirectional voice conversation with sub-700ms latency, including async tool calling mid-sentence
- **Nova Act** controls a real Chrome browser to navigate websites, click buttons, fill forms, and scroll
- **Nova 2 Lite** analyzes browser screenshots to provide accessibility-friendly page summaries

Users interact via voice or text. The frontend shows a live browser view and conversation transcript. The system acknowledges commands immediately ("Let me search for that..."), performs the browsing action, and responds with a natural spoken summary of what it found.

## How we built it

**Architecture**: React frontend communicates via Socket.IO WebSocket to a FastAPI backend. The backend runs a Strands BidiAgent connected to Nova Sonic in us-east-1 for real-time speech-to-speech. When the user's voice triggers a browsing intent, Nova Sonic issues tool calls (browse_website, read_page, refine_search, navigate_back) which the agent executes asynchronously without interrupting the voice stream.

**Nova Sonic integration**: We use the Strands SDK's `BidiNovaSonicModel` with bidirectional HTTP/2 streaming. Audio flows continuously in both directions — the user's microphone PCM streams to Nova Sonic, and the model's spoken responses stream back to the client's AudioContext for gapless playback. A keepalive loop sends silent frames to prevent stream timeout. The system prompt shapes the voice persona for accessibility (short responses, spatial descriptions, no raw URLs).

**Nova Act integration**: Browser automation uses the Nova Act Python SDK with Xvfb virtual display for headed-mode browsing inside Docker. Each tool wraps Nova Act sessions with per-session thread pinning to satisfy Playwright's greenlet threading requirements. Screenshots are captured after each action and streamed to the frontend in real time.

**Nova 2 Lite integration**: The `read_page` tool captures a browser screenshot via the Playwright Page API, encodes it as JPEG, and sends it to Nova 2 Lite via Bedrock's Converse API in us-west-2 (cross-region inference profile). The model returns an accessibility-optimized description — headings, main content, navigation options, and interactive elements.

**Infrastructure**: Docker Compose orchestrates the backend (Python 3.12 with Chrome and Xvfb) and Nginx (serving the built React frontend). Session management handles up to 3 concurrent users with automatic idle cleanup. All audio processing is real-time — no batch transcription.

## Technical Implementation (60%)

**Deep Nova integration across 3 models:**
- Nova Sonic BidiAgent with custom voice persona, audio keepalive protocol, and event-driven architecture mapping BidiAgent events to Socket.IO
- Nova Act browser automation with 4 distinct tools, each handling different browsing patterns (navigation, reading, refinement, history)
- Nova 2 Lite vision analysis generating accessible page descriptions from screenshots
- Strands SDK orchestration — BidiAgent manages the tool calling lifecycle, invoking browser tools mid-voice-conversation without breaking the audio stream

**Real-time bidirectional audio pipeline:**
- Client: MediaRecorder captures microphone → resamples to 16kHz mono PCM → base64 encodes → Socket.IO
- Server: Forwards PCM to Nova Sonic BidiAgent → receives synthesized audio → base64 → Socket.IO
- Client: Decodes PCM → AudioContext queue with gapless playback via chained AudioBufferSourceNodes

**Production-grade engineering:**
- Thread-safe browser session management with per-session dedicated thread executors (Nova Act/Playwright greenlet thread pinning)
- Xvfb virtual display in Docker for headed-mode browsing — reduces bot detection compared to headless mode
- Automatic session cleanup on disconnect or idle timeout (10-minute window)
- Graceful error handling with user-friendly spoken status messages (no raw errors exposed to the user)
- ARIA-compliant frontend with keyboard shortcuts (Ctrl+Shift+S/M/T), WCAG-audited with 0 violations (38 axe-core rules)
- Comprehensive E2E test suite: session lifecycle, concurrent sessions, error recovery, vision analysis, and 3 real-site demo scenarios (Zillow, Amazon, CNN)
- Docker multi-stage builds for production (Nginx reverse proxy + built frontend + backend)

## Production Vision: Browser Extension Architecture

While this prototype uses a cloud-hosted browser (Nova Act on a server), we designed AccessVoice with a clear path to production as a **Chrome/Edge browser extension**:

| Challenge | Cloud Browser (Prototype) | Browser Extension (Production) |
|---|---|---|
| Bot detection / CAPTCHAs | Sites may block cloud IPs | Non-issue — uses user's own browser and IP |
| User authentication | No access to user's accounts | User's existing logins are already active |
| Cost per user | Server-side Chrome per session | Only cloud AI inference costs |
| Works on banking/healthcare | Blocked (no auth) | Yes — user's own authenticated sessions |
| Privacy | Pages rendered on cloud server | Pages stay in user's browser |

**Extension architecture:**

```
User's Browser (Chrome/Edge Extension)
  Content Script  — executes actions (click, type, scroll) locally
  Offscreen Doc   — mic capture + audio playback via getUserMedia
  Service Worker  — screenshot capture, WebSocket to cloud, orchestration

Cloud Backend (AWS)
  Nova Sonic      — real-time voice conversation
  Nova 2 Lite     — page understanding from screenshots
  Action Planner  — determines what browser actions to take
```

The extension captures screenshots and accessibility tree data from the user's active tab, sends them to the cloud for AI reasoning, and receives structured action commands that execute locally. This preserves the same three-model pipeline while eliminating the cloud browser entirely.

## Enterprise / Community Impact (20%)

**Target audience**: 2.2 billion people globally have vision impairments (WHO, 2023). Current assistive technology for web browsing — screen readers like JAWS ($100+/year), NVDA, VoiceOver — requires users to learn complex keyboard shortcuts, understand DOM structure, and navigate element-by-element. This creates a steep learning curve and excludes casual browsing tasks that sighted users take for granted.

**The problem AccessVoice solves**: Everyday web tasks — searching for an apartment, shopping for clothes, reading the news — are disproportionately difficult for visually impaired users. AccessVoice removes the technical barrier entirely. Users describe what they want in plain language, and the system handles all navigation autonomously.

**Enterprise applications**:
- **Assistive technology providers** can integrate AccessVoice as a conversational layer on top of existing accessibility tools
- **Organizations with accessibility mandates** (ADA, Section 508, WCAG) can offer voice-browsing as a supplementary access method
- **Customer service teams** can use the technology to help visually impaired customers navigate complex web portals
- **Education**: students with visual impairments can independently research and browse learning materials

**Market gap**: There is no product in 2026 that combines voice-first conversational interface, AI-powered web navigation (not just reading), and the potential for lightweight browser extension deployment. Existing screen readers require learning complex shortcuts. AI browsers (ChatGPT Atlas) are not accessibility-focused. AccessVoice fills this gap.

## Creativity & Innovation (20%)

**What's novel**: AccessVoice is the first voice-first web browser that combines Nova Sonic's real-time streaming speech with Nova Act's browser automation. Previous approaches either use text-based chatbots that navigate the web (requiring typing and reading) or voice assistants that can only answer questions (no browsing). AccessVoice merges both: the user speaks, the system browses, and it speaks back — a fully eyes-free, hands-free web experience.

**Technical innovation**:
- **Async tool execution during live voice**: Nova Sonic's tool calling happens mid-conversation. The model says "Let me search for that..." while simultaneously executing the browse_website tool. No awkward silence while the system works.
- **Cross-model pipeline**: Screenshots flow from Nova Act (browser) → Nova 2 Lite (vision) → Nova Sonic (voice). Three models collaborate in real-time on a single user request.
- **Audio keepalive protocol**: Nova Sonic requires continuous audio input. We implemented a silent-frame keepalive that maintains the bidirectional stream during tool execution, preventing timeouts without sending noise.
- **Thread-pinned browser sessions**: Nova Act uses Playwright greenlets that require thread affinity. We built per-session dedicated thread executors so the BidiAgent's concurrent tool dispatcher works correctly with Nova Act's threading model.
- **Production-ready architecture**: Designed with a clear migration path from cloud prototype to browser extension, demonstrating systems thinking beyond the hackathon.

## Categories

- **Best Voice AI** (primary)
- **Best UI Automation** (secondary)
- **Best Agentic System**

## Built With

- Amazon Nova 2 Sonic
- Amazon Nova Act
- Amazon Nova 2 Lite
- AWS Strands SDK (BidiAgent)
- AWS Bedrock
- Python
- FastAPI
- React
- TypeScript
- Docker
- Socket.IO
- Nginx

## Try It Out

- [GitHub Repository](https://github.com/sgharlow/accessvoice)
- Demo video: [Upload to YouTube/Devpost] <!-- #AmazonNova -->

## Video Notes

Demo video requirements:
- ~3 minutes showing real browsing scenarios (Zillow, Amazon, CNN)
- Include **#AmazonNova** hashtag in the video title or description
- Narrated video available at `demo-recording/accessvoice-demo-narrated.mp4`

## Repo Access for Judges

Grant read access to:
- `testing@devpost.com`
- `Amazon-Nova-hackathon@amazon.com`
