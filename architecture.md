# AccessVoice — System Architecture

## High-Level Flow

```mermaid
graph TD
    User["User (Voice / Text)"]

    subgraph Extension["Chrome Extension (Manifest V3)"]
        Sidepanel["Sidepanel UI<br/>VoiceControls, BrowserView,<br/>TranscriptPanel, TextInput"]
        ContentScript["Content Script<br/>DOM actions: click, type,<br/>scroll, screenshot capture"]
        ServiceWorker["Service Worker<br/>Socket.IO client,<br/>action dispatch, screenshot relay"]
        Offscreen["Offscreen Document<br/>Audio capture + playback<br/>via Web Audio API"]
    end

    subgraph Backend["FastAPI Backend"]
        SIO["Socket.IO Server<br/>Events: audio_chunk, text_input,<br/>start/stop_session"]
        SessionMgr["SessionManager<br/>Max 3 concurrent, idle cleanup"]
        VoiceAgent["VoiceAgent<br/>Strands BidiAgent wrapper"]
    end

    subgraph NovaSonic["Nova Sonic (us-east-1)"]
        BidiAgent["BidiNovaSonicModel<br/>Bidirectional HTTP/2 streaming"]
        ToolRouter["Async Tool Calling<br/>(mid-conversation)"]
    end

    subgraph Tools["Backend Tools"]
        Browse["browse_website<br/>Screenshot → Action Planner → Extension"]
        ActionPlanner["action_planner<br/>Nova 2 Lite vision planning"]
        ReadPage["read_page<br/>Nova 2 Lite (us-west-2)"]
    end

    UserBrowser["User's Active Tab<br/>(any website)"]

    User -->|"Speech / typed text"| Sidepanel
    Sidepanel --> Offscreen
    Offscreen -->|"base64 PCM"| ServiceWorker
    Sidepanel -->|"text commands"| ServiceWorker
    ServiceWorker -->|"Socket.IO"| SIO
    SIO --> SessionMgr
    SessionMgr --> VoiceAgent
    VoiceAgent -->|"audio stream"| BidiAgent
    BidiAgent -->|"tool_use events"| ToolRouter
    ToolRouter --> Browse
    ToolRouter --> ReadPage
    Browse -->|"request screenshot"| ServiceWorker
    ServiceWorker -->|"capture"| ContentScript
    ContentScript -->|"screenshot"| ServiceWorker
    ServiceWorker -->|"screenshot data"| Browse
    Browse --> ActionPlanner
    ActionPlanner -->|"action command"| Browse
    Browse -->|"execute action"| ServiceWorker
    ServiceWorker -->|"click/type/scroll"| ContentScript
    ContentScript --> UserBrowser
    BidiAgent -->|"audio + transcript"| VoiceAgent
    VoiceAgent -->|"Socket.IO events"| SIO
    SIO --> ServiceWorker
    ServiceWorker --> Offscreen
    ServiceWorker -->|"transcript, screenshot,<br/>status updates"| Sidepanel
    Offscreen -->|"spoken response"| User
    Sidepanel -->|"visual feedback"| User
```

## Data Flow Detail

```mermaid
sequenceDiagram
    participant U as User
    participant SP as Sidepanel UI
    participant SW as Service Worker
    participant CS as Content Script
    participant B as FastAPI Backend
    participant NS as Nova Sonic
    participant NL as Nova 2 Lite

    U->>SP: Click "Start Session"
    SP->>SW: chrome.runtime.sendMessage(start_session)
    SW->>B: Socket.IO: start_session
    B->>NS: BidiAgent.start() (us-east-1)
    NS-->>B: Connection established
    B-->>SW: session_started
    SW-->>SP: session_started
    SP-->>U: "Connected — listening..."

    U->>SP: "Find apartments in Seattle"
    SP->>SW: chrome.runtime.sendMessage(text_input)
    SW->>B: Socket.IO: text_input
    B->>NS: Text → BidiAgent
    NS-->>B: transcript (user text)
    B-->>SW: transcript event
    NS->>B: tool_use: browse_website
    B-->>SW: status: "Browsing the web..."

    Note over B,CS: Multi-step browse loop (up to 10 steps)

    B->>SW: request_screenshot
    SW->>CS: captureVisibleTab + getPageInfo
    CS-->>SW: screenshot + page metadata
    SW-->>B: screenshot_response

    B->>NL: Action Planner (screenshot + goal)
    NL-->>B: {action: "navigate", url: "apartments.com/..."}

    B->>SW: execute_action(navigate)
    SW->>CS: Navigate to URL
    CS-->>SW: Action complete
    SW-->>B: action_response

    Note over B,CS: Repeat: screenshot → plan → act until done

    B->>NL: read_page (final screenshot)
    NL-->>B: Accessible page summary

    NS-->>B: Audio response: "I found several listings..."
    B-->>SW: audio event (base64 PCM)
    SW-->>SP: audio data
    SP-->>U: Plays spoken response + shows transcript
```

## Component Responsibilities

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **Sidepanel** | React 18 + TypeScript | Voice controls, transcript display, text input, browser view |
| **Service Worker** | Chrome MV3 + Socket.IO | Backend communication, screenshot relay, action dispatch |
| **Content Script** | Vanilla JS | DOM actions (click, type, scroll), screenshot capture, page info |
| **Offscreen Document** | Web Audio API | Microphone capture (PCM), audio playback queue |
| **Backend** | FastAPI + python-socketio | Session management, VoiceAgent lifecycle, event routing |
| **VoiceAgent** | Strands BidiAgent | Nova Sonic connection, event loop, tool dispatch |
| **browse_website** | Extension coordination | Multi-step browsing: screenshot → plan → act loop |
| **action_planner** | Nova 2 Lite (Bedrock) | Vision-based DOM action planning from screenshots |
| **read_page** | Nova 2 Lite (Bedrock) | Accessibility-friendly page summaries from screenshots |

## Extension Architecture

```mermaid
graph LR
    subgraph Chrome["User's Chrome Browser"]
        Tab["Active Tab<br/>(any website)"]
        CS["Content Script<br/>Injected into all pages"]
        SW["Service Worker<br/>Background orchestration"]
        SP["Sidepanel<br/>React UI"]
        OF["Offscreen Doc<br/>Audio I/O"]
    end

    subgraph Cloud["Cloud Backend (AWS)"]
        API["FastAPI<br/>:8000"]
        Sonic["Nova Sonic<br/>us-east-1"]
        Lite["Nova 2 Lite<br/>us-west-2"]
    end

    CS <-->|"DOM actions<br/>screenshots"| SW
    SW <-->|"Socket.IO<br/>WebSocket"| API
    SP <-->|"chrome.runtime<br/>messages"| SW
    OF <-->|"chrome.runtime<br/>messages"| SW
    CS --> Tab
    API --> Sonic
    API --> Lite
```
