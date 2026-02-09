# AccessVoice — Devpost Submission

## Project Title
AccessVoice — Voice-Driven Web Browser for Accessibility

## One-Liner
A voice-first web browser that lets visually impaired users browse the internet through natural conversation, powered by three Amazon Nova models working in concert.

## What it does

AccessVoice replaces the traditional screen reader + keyboard navigation paradigm with natural voice conversation. Users speak commands like "Search for apartments in Seattle on Zillow" and AccessVoice autonomously browses the web, reads page content, refines searches, and reports results — all through real-time spoken dialogue.

The system combines three Nova models into a seamless experience:
- **Nova Sonic** handles bidirectional voice conversation with sub-700ms latency, including async tool calling mid-sentence
- **Nova Act** controls a browser to navigate websites, click buttons, fill forms, and scroll
- **Nova 2 Lite** analyzes screenshots to provide accessibility-friendly page summaries

Users interact via voice or text. The frontend shows a live browser view and conversation transcript. The system acknowledges commands immediately ("Let me search for that..."), performs the browsing action, and responds with a natural summary of what it found.

## How we built it

**Architecture**: React frontend communicates via Socket.IO WebSocket to a FastAPI backend. The backend runs a Strands BidiAgent connected to Nova Sonic in us-east-1 for real-time speech-to-speech. When the user's voice triggers a browsing intent, Nova Sonic issues tool calls (browse_website, read_page, refine_search, navigate_back) which the agent executes asynchronously without interrupting the voice stream.

**Nova Sonic integration**: We use the Strands SDK's `BidiNovaSonicModel` with bidirectional HTTP/2 streaming. Audio flows continuously in both directions — user's microphone PCM streams to Nova Sonic, and the model's spoken responses stream back to the client's AudioContext for gapless playback. A keepalive loop sends silent frames to prevent stream timeout. The system prompt shapes the voice persona for accessibility (short responses, spatial descriptions, no raw URLs).

**Nova Act integration**: Browser automation uses the Nova Act Python SDK with Xvfb virtual display for headed-mode browsing. Each tool (browse, refine, navigate) wraps Nova Act sessions with per-session thread pinning to satisfy Playwright's greenlet threading requirements. Screenshots are captured after each action and streamed to the frontend for visual feedback.

**Nova 2 Lite integration**: The `read_page` tool captures a browser screenshot via Playwright's Page API, encodes it as JPEG, and sends it to Nova 2 Lite via Bedrock's Converse API in us-west-2 (cross-region inference profile). The model returns an accessibility-optimized description of the page content — headings, main content, navigation options, and interactive elements.

**Infrastructure**: Docker Compose orchestrates the backend (Python 3.12 with Chrome and Xvfb) and Nginx (serving the built React frontend). Session management handles up to 3 concurrent users with automatic idle cleanup. All audio processing is real-time — no batch transcription.

## Technical Implementation (60%)

**Deep Nova integration across 3 models:**
- Nova Sonic BidiAgent with custom voice persona, audio keepalive, reconnection handling, and event-driven architecture mapping BidiAgent events to Socket.IO
- Nova Act browser automation with 4 distinct tools, each handling different browsing patterns (navigation, reading, refinement, history)
- Nova 2 Lite vision analysis for generating accessible page descriptions from screenshots
- Strands SDK orchestration — BidiAgent manages the tool calling lifecycle, invoking browser tools mid-voice-conversation without breaking the audio stream

**Real-time bidirectional audio pipeline:**
- Client: MediaRecorder captures microphone -> resamples to 16kHz mono PCM -> base64 encodes -> Socket.IO
- Server: Forwards PCM to Nova Sonic BidiAgent -> receives synthesized audio -> base64 -> Socket.IO
- Client: Decodes PCM -> AudioContext queue with gapless playback via chained AudioBufferSourceNodes

**Production-grade engineering:**
- Thread-safe browser session management with per-session dedicated thread executors (Nova Act/Playwright greenlet thread pinning)
- Nova Act 3.1.x API compatibility — exception-based flow control, Playwright Page API for screenshots/content
- Xvfb virtual display for headed-mode browsing to reduce bot detection fingerprinting
- Automatic session cleanup on disconnect or idle timeout
- Graceful error handling with user-friendly status messages (no raw errors exposed)
- ARIA-compliant frontend with keyboard shortcuts (Ctrl+Shift+S/M/T)
- Docker multi-stage build for production (Nginx + built frontend + backend)

## Production Vision: Browser Extension Architecture

While this prototype uses a cloud-hosted browser (Nova Act on a server), we designed AccessVoice with a clear path to production as a **Chrome/Edge browser extension**. This architectural evolution solves several critical challenges:

**Why an extension is the right production architecture:**

| Challenge | Cloud Browser (Prototype) | Browser Extension (Production) |
|---|---|---|
| Bot detection / CAPTCHAs | Sites block cloud IPs | Non-issue — uses user's own browser and IP |
| User authentication | No access to user's accounts | User's existing logins are already active |
| Cost per user | High (server-side Chrome per session) | Low (only cloud AI inference costs) |
| Works on banking/healthcare | No (blocked, no auth) | Yes — user's own authenticated sessions |
| Privacy | Pages rendered on cloud server | Pages stay in user's browser, only screenshots/DOM sent for AI analysis |

**Extension architecture design:**

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

The extension captures screenshots and accessibility tree data from the user's active tab, sends them to the cloud backend for AI reasoning, and receives structured action commands that execute locally. Voice streams bidirectionally through an offscreen document. This preserves the same three-model pipeline while eliminating the cloud browser entirely.

**Market opportunity**: There is no product in 2026 that combines voice-first conversational interface, AI-powered web navigation (not just reading), and lightweight browser extension deployment. Existing screen readers (JAWS at $100+/year, NVDA) require learning complex keyboard shortcuts. AI browsers (ChatGPT Atlas at $20-200/month) are not accessibility-focused. AccessVoice fills this gap.

## Enterprise / Community Impact (20%)

**Target audience**: 2.2 billion people globally have vision impairments (WHO, 2023). Current assistive technology for web browsing — screen readers like JAWS, NVDA, VoiceOver — requires users to learn complex keyboard shortcuts, understand DOM structure, and navigate element-by-element. This creates a steep learning curve and excludes casual browsing tasks.

**The problem AccessVoice solves**: Everyday web tasks — searching for an apartment, shopping for clothes, reading the news — are disproportionately difficult for visually impaired users. AccessVoice removes the technical barrier entirely. Users describe what they want in plain language, and the system handles all navigation autonomously.

**Enterprise applications**:
- **Assistive technology providers** can integrate AccessVoice as a conversational layer on top of existing accessibility tools
- **Organizations with accessibility mandates** (ADA, Section 508, WCAG) can offer voice-browsing as a supplementary access method
- **Customer service teams** can use the technology to help visually impaired customers navigate complex web portals
- **Education**: students with visual impairments can independently research and browse learning materials

## Creativity & Innovation (20%)

**What's novel**: AccessVoice is the first voice-first web browser that combines Nova Sonic's real-time streaming speech with Nova Act's browser automation. Previous approaches either use text-based chatbots that navigate the web (requiring typing and reading) or voice assistants that can only answer questions (no browsing). AccessVoice merges both: the user speaks, the system browses, and it speaks back — a fully eyes-free, hands-free web experience.

**Technical innovation**:
- **Async tool execution during live voice**: Nova Sonic's tool calling happens mid-conversation. The model says "Let me search for that..." while simultaneously executing the browse_website tool. No awkward silence while the system thinks.
- **Cross-model pipeline**: Screenshots flow from Nova Act (browser) -> Nova 2 Lite (vision) -> Nova Sonic (voice). Three models collaborate in real-time on a single user request.
- **Audio keepalive protocol**: Nova Sonic requires continuous audio input. We implemented a silent-frame keepalive that maintains the bidirectional stream during tool execution, preventing timeouts without sending noise.
- **Thread-pinned browser sessions**: Nova Act uses Playwright greenlets that require thread affinity. We built per-session dedicated thread executors so the BidiAgent's concurrent tool dispatcher works correctly with Nova Act's threading model.
- **Production-ready architecture**: Designed with a clear migration path from cloud prototype to browser extension, demonstrating systems thinking beyond the hackathon.

## Categories

- **Best Voice AI** (primary)
- **Best UI Automation**
- **Best Agentic System**

## Built With

- Amazon Nova 2 Sonic
- Amazon Nova Act
- Amazon Nova 2 Lite
- AWS Strands SDK
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
- Demo video: [link to video]
