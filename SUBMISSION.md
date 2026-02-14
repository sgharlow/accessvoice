# AccessVoice — Devpost Submission

## Project Title
AccessVoice — Voice-Driven Web Browser for Accessibility

## One-Liner
A Chrome Extension that lets visually impaired users browse the internet through natural voice conversation, powered by Amazon Nova Sonic and Nova 2 Lite working in concert.

## What it does

AccessVoice replaces the traditional screen reader + keyboard navigation paradigm with natural voice conversation. Users speak commands like "Search for apartments in Seattle" and AccessVoice autonomously browses the web, reads page content, refines searches, and reports results — all through real-time spoken dialogue.

The system runs as a **Chrome Extension** that controls the user's own browser, combining two Nova models into a seamless experience:
- **Nova Sonic** handles bidirectional voice conversation with sub-700ms latency, including async tool calling mid-sentence
- **Nova 2 Lite** serves dual roles: analyzing browser screenshots to plan DOM actions (click, type, scroll, navigate) AND generating accessibility-friendly page summaries

Users interact via voice or text through the extension's sidepanel. The system acknowledges commands immediately ("Let me search for that..."), performs the browsing action in the user's active tab, and responds with a natural spoken summary of what it found.

## How we built it

**Chrome Extension Architecture**: AccessVoice is a Manifest V3 Chrome Extension with four components: a **service worker** managing Socket.IO communication with the backend, a **content script** injected into every page to execute DOM actions and capture screenshots, an **offscreen document** for microphone capture and audio playback via Web Audio API, and a **sidepanel** built with React showing the conversation transcript and browser screenshots.

**Nova Sonic integration**: We use the Strands SDK's `BidiNovaSonicModel` with bidirectional HTTP/2 streaming. Audio flows continuously in both directions — the user's microphone PCM streams through the extension to Nova Sonic, and the model's spoken responses stream back for gapless playback. A keepalive loop sends silent frames to prevent stream timeout. The system prompt shapes the voice persona for accessibility (short responses, spatial descriptions, no raw URLs).

**Nova 2 Lite as Action Planner**: This is our key innovation — using Nova 2 Lite's vision capabilities for **autonomous browser control**. When the user requests a browsing task, the `browse_website` tool enters a multi-step loop (up to 10 steps):
1. Request a screenshot from the extension's content script
2. Send the screenshot + user goal to Nova 2 Lite as an action planner
3. Nova 2 Lite analyzes the page visually and returns a structured action: `{action: "click", selector: "#search-button"}` or `{action: "type", selector: "#input", text: "apartments seattle"}`
4. The backend sends the action to the extension, which executes it in the user's browser
5. Repeat until Nova 2 Lite returns `{action: "done", summary: "..."}`

This vision-based action planning approach means the system works on any website without needing site-specific integrations — it sees the page like a human would.

**Nova 2 Lite for Page Reading**: The `read_page` tool captures a screenshot and sends it to Nova 2 Lite via Bedrock's Converse API, generating accessibility-optimized descriptions — headings, main content, navigation options, and interactive elements.

**Why a Chrome Extension?** Running in the user's own browser eliminates bot detection issues (no cloud IPs), works with authenticated sites (banking, email), reduces costs (no server-side browser), and keeps page content private.

## Technical Implementation (60%)

**Deep Nova integration across 2 models:**
- Nova Sonic BidiAgent with custom voice persona, audio keepalive protocol, and event-driven architecture mapping BidiAgent events to Socket.IO → Chrome Extension messaging
- Nova 2 Lite in dual roles: (1) vision-based action planner that turns screenshots into DOM actions, and (2) accessibility page reader generating structured content summaries
- Strands SDK orchestration — BidiAgent manages the tool calling lifecycle, invoking browser tools mid-voice-conversation without breaking the audio stream

**Chrome Extension (Manifest V3) pipeline:**
- Service Worker: Socket.IO client connecting to backend, relays screenshot requests and action commands between backend and content script
- Content Script: Executes DOM actions (click, type, scroll, navigate), captures screenshots via `chrome.tabs.captureVisibleTab`, extracts page metadata
- Offscreen Document: Microphone capture via `getUserMedia`, audio playback queue via `AudioContext` with chained `AudioBufferSourceNode`s
- Sidepanel: React UI with conversation transcript, browser screenshots, text input fallback

**Real-time bidirectional audio pipeline:**
- Extension: Offscreen doc captures microphone → resamples to 16kHz mono PCM → base64 encodes → service worker → Socket.IO
- Server: Forwards PCM to Nova Sonic BidiAgent → receives synthesized audio → base64 → Socket.IO
- Extension: Service worker → offscreen doc → AudioContext queue with gapless playback

**Multi-step autonomous browsing:**
- Vision-based action planning loop: screenshot → Nova 2 Lite analysis → structured action → extension execution → repeat
- Actions supported: navigate, click, type, scroll, wait, done
- Up to 10 steps per browsing task with automatic completion detection
- Works across arbitrary websites — no site-specific selectors or integrations needed

**Production-grade engineering:**
- Automatic session cleanup on disconnect or idle timeout (10-minute window)
- Graceful error handling with user-friendly spoken status messages
- ARIA-compliant frontend with keyboard shortcuts (Ctrl+Shift+S/M/T), WCAG-audited with 0 violations (38 axe-core rules)
- Comprehensive E2E test suite: session lifecycle, concurrent sessions, error recovery, vision analysis, and 3 real-site demo scenarios
- Extension works in headed Chrome — no headless mode, no virtual displays, no Docker required for browser

## Enterprise / Community Impact (20%)

**Target audience**: 2.2 billion people globally have vision impairments (WHO, 2023). Current assistive technology for web browsing — screen readers like JAWS ($100+/year), NVDA, VoiceOver — requires users to learn complex keyboard shortcuts, understand DOM structure, and navigate element-by-element. This creates a steep learning curve and excludes casual browsing tasks that sighted users take for granted.

**The problem AccessVoice solves**: Everyday web tasks — searching for an apartment, shopping for clothes, reading the news — are disproportionately difficult for visually impaired users. AccessVoice removes the technical barrier entirely. Users describe what they want in plain language, and the system handles all navigation autonomously.

**Why the Chrome Extension approach matters for impact**:
- **Zero deployment friction**: Users install a Chrome extension — no servers, no Docker, no technical setup
- **Works with existing logins**: Banking, email, healthcare portals — all accessible via voice
- **Privacy-preserving**: Page content never leaves the user's browser (only screenshots sent for AI analysis)
- **Cost-effective**: No per-user browser infrastructure — only AI inference costs scale

**Enterprise applications**:
- **Assistive technology providers** can integrate AccessVoice as a conversational layer on top of existing accessibility tools
- **Organizations with accessibility mandates** (ADA, Section 508, WCAG) can offer voice-browsing as a supplementary access method
- **Customer service teams** can use the technology to help visually impaired customers navigate complex web portals
- **Education**: students with visual impairments can independently research and browse learning materials

**Market gap**: There is no product in 2026 that combines voice-first conversational interface, AI-powered web navigation (not just reading), and lightweight browser extension deployment. Existing screen readers require learning complex shortcuts. AI browsers are not accessibility-focused. AccessVoice fills this gap.

## Creativity & Innovation (20%)

**What's novel**: AccessVoice is the first voice-first web browser that combines Nova Sonic's real-time streaming speech with vision-based autonomous browser control via a Chrome Extension. Previous approaches either use text-based chatbots that navigate the web (requiring typing and reading) or voice assistants that can only answer questions (no browsing). AccessVoice merges both: the user speaks, the system browses, and it speaks back — a fully eyes-free, hands-free web experience.

**Technical innovation**:
- **Nova 2 Lite as an action planner**: Using a vision model to plan DOM actions from screenshots is a novel approach that works on any website without site-specific integrations. The model sees the page like a human, determines what to click/type/scroll, and outputs structured action commands.
- **Async tool execution during live voice**: Nova Sonic's tool calling happens mid-conversation. The model says "Let me search for that..." while simultaneously executing the browse_website tool. No awkward silence while the system works.
- **Two-model pipeline via Chrome Extension**: Screenshots flow from the user's browser → content script → service worker → backend → Nova 2 Lite (action planning) → action commands → back through the extension → DOM execution. This round-trip happens in real-time during a live voice conversation.
- **Audio keepalive protocol**: Nova Sonic requires continuous audio input. We implemented a silent-frame keepalive that maintains the bidirectional stream during tool execution, preventing timeouts without sending noise.
- **Extension-native architecture**: Unlike approaches that embed a browser in a server (headless Chrome, Puppeteer, Selenium), AccessVoice runs in the user's own browser. This is architecturally superior for accessibility — it respects the user's preferences, extensions, bookmarks, and authenticated sessions.

## Categories

- **Best Voice AI** (primary)
- **Best UI Automation** (secondary)
- **Best Agentic System**

## Built With

- Amazon Nova 2 Sonic
- Amazon Nova 2 Lite
- AWS Strands SDK (BidiAgent)
- AWS Bedrock
- Chrome Extension (Manifest V3)
- Python
- FastAPI
- React
- TypeScript
- Socket.IO

## Try It Out

- [GitHub Repository](https://github.com/sgharlow/accessvoice)
- Demo video: [Upload to YouTube/Devpost] <!-- #AmazonNova -->

## Video Notes

Demo video requirements:
- ~3 minutes showing real browsing scenarios (Apartments.com, Amazon, CNN)
- Include **#AmazonNova** hashtag in the video title or description
- Narrated video available at `demo-recording/accessvoice-demo-narrated.mp4`

## Repo Access for Judges

Grant read access to:
- `testing@devpost.com`
- `Amazon-Nova-hackathon@amazon.com`
