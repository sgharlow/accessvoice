# AccessVoice — System Architecture

## High-Level Flow

```mermaid
graph TD
    User["User (Voice / Text)"]

    subgraph Frontend["React Frontend (Vite)"]
        UI["App UI<br/>VoiceControls, BrowserView,<br/>TranscriptPanel, TextInput"]
        AudioStream["useAudioStream<br/>MediaRecorder → PCM chunks"]
        SocketHook["useSocketIO<br/>Socket.IO client"]
        AudioQueue["AudioQueue<br/>PCM → AudioContext playback"]
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

    subgraph Tools["Browser Tools"]
        Browse["browse_website<br/>Nova Act SDK"]
        ReadPage["read_page<br/>Nova 2 Lite (us-west-2)"]
        Refine["refine_search<br/>Nova Act SDK"]
        NavBack["navigate_back<br/>Nova Act SDK"]
    end

    Browser["Headless Chrome<br/>(in Docker)"]

    User -->|"Speech / typed text"| UI
    UI --> AudioStream
    AudioStream -->|"base64 PCM"| SocketHook
    UI -->|"text commands"| SocketHook
    SocketHook -->|"Socket.IO"| SIO
    SIO --> SessionMgr
    SessionMgr --> VoiceAgent
    VoiceAgent -->|"audio stream"| BidiAgent
    BidiAgent -->|"tool_use events"| ToolRouter
    ToolRouter --> Browse
    ToolRouter --> ReadPage
    ToolRouter --> Refine
    ToolRouter --> NavBack
    Browse --> Browser
    Refine --> Browser
    NavBack --> Browser
    Browser -->|"screenshot"| ReadPage
    BidiAgent -->|"audio + transcript"| VoiceAgent
    VoiceAgent -->|"Socket.IO events"| SIO
    SIO --> SocketHook
    SocketHook --> AudioQueue
    SocketHook -->|"transcript, screenshot,<br/>status updates"| UI
    AudioQueue -->|"spoken response"| User
    UI -->|"visual feedback"| User
```

## Data Flow Detail

```mermaid
sequenceDiagram
    participant U as User
    participant F as React Frontend
    participant S as Socket.IO
    participant B as FastAPI Backend
    participant NS as Nova Sonic
    participant NA as Nova Act
    participant NL as Nova 2 Lite

    U->>F: Click "Start Session"
    F->>S: start_session
    S->>B: Create VoiceAgent
    B->>NS: BidiAgent.start() (us-east-1)
    NS-->>B: Connection established
    B-->>F: session_started
    F-->>U: "Connected — listening..."

    U->>F: "Find apartments in Seattle on Zillow"
    F->>S: audio_chunk (base64 PCM)
    S->>B: Forward to BidiAgent
    B->>NS: BidiAudioInputEvent
    NS-->>B: transcript (user speech)
    B-->>F: transcript event
    NS->>B: tool_use: browse_website
    B-->>F: status: "Browsing the web..."
    B->>NA: browse_website("zillow.com", "search apartments Seattle")
    NA-->>B: Screenshot + result
    B-->>F: screenshot event
    NS-->>B: Audio response: "I found several listings..."
    B-->>F: audio event (base64 PCM)
    F-->>U: Plays spoken response + shows screenshot
```

## Component Responsibilities

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **Frontend** | React 18 + TypeScript + Vite | Audio capture/playback, Socket.IO transport, visual feedback |
| **Backend** | FastAPI + python-socketio | Session management, VoiceAgent lifecycle, event routing |
| **VoiceAgent** | Strands BidiAgent | Nova Sonic connection, event loop, tool dispatch |
| **browse_website** | Nova Act SDK | Navigate to URLs, perform browser actions |
| **read_page** | Nova 2 Lite (Bedrock) | Analyze screenshots for accessibility summaries |
| **refine_search** | Nova Act SDK | Adjust filters/queries on current page |
| **navigate_back** | Nova Act SDK | Browser history navigation |
| **Nginx** | nginx:alpine | Reverse proxy, WebSocket upgrade, static file serving |

## Deployment Topology

```mermaid
graph LR
    Internet["Internet<br/>(Port 80)"]
    subgraph EC2["EC2 Instance (t3.xlarge)"]
        Nginx["Nginx<br/>:80"]
        Backend["FastAPI<br/>:8000"]
        Chrome["Headless Chrome"]
    end
    subgraph AWS["AWS Cloud"]
        Sonic["Nova Sonic<br/>us-east-1"]
        Lite["Nova 2 Lite<br/>us-west-2"]
        Act["Nova Act<br/>API"]
    end

    Internet --> Nginx
    Nginx -->|"static files"| Nginx
    Nginx -->|"/socket.io/"| Backend
    Backend --> Chrome
    Backend --> Sonic
    Backend --> Lite
    Backend --> Act
```
