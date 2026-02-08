"""AccessVoice backend — FastAPI + Socket.IO server for voice-driven web browsing."""

import asyncio
import logging
import uuid

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import (
    CORS_ORIGINS,
    BACKEND_PORT,
    MAX_CONCURRENT_SESSIONS,
)
from services.session_manager import SessionManager
from agents.voice_agent import VoiceAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("accessvoice")

# FastAPI app
app = FastAPI(title="AccessVoice", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=CORS_ORIGINS,
    max_http_buffer_size=10 * 1024 * 1024,  # 10MB for screenshots
)
socket_app = socketio.ASGIApp(sio, app)

# Session manager
sessions = SessionManager(max_sessions=MAX_CONCURRENT_SESSIONS)


@app.on_event("startup")
async def on_startup():
    """Start background tasks on server startup."""
    sessions.start_cleanup_loop()


@app.on_event("shutdown")
async def on_shutdown():
    """Clean up all sessions on server shutdown."""
    await sessions.cleanup_all()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "active_sessions": sessions.active_count,
        "max_sessions": MAX_CONCURRENT_SESSIONS,
    }


# -- Socket.IO Events ---------------------------------------------------------


@sio.event
async def connect(sid: str, environ: dict):
    logger.info(f"Client connected: {sid}")


@sio.event
async def disconnect(sid: str):
    logger.info(f"Client disconnected: {sid}")
    await sessions.cleanup(sid)


@sio.event
async def start_session(sid: str, data: dict):
    """Client requests a new voice session."""
    if sessions.active_count >= MAX_CONCURRENT_SESSIONS:
        await sio.emit("error", {"message": "Server at capacity. Please try again later."}, to=sid)
        return

    session_id = str(uuid.uuid4())
    logger.info(f"Starting session {session_id} for {sid}")

    try:
        # Capture the event loop — callbacks may be invoked from tool threads
        # (BidiAgent runs tools via ConcurrentToolExecutor in separate threads).
        # run_coroutine_threadsafe ensures the coroutine is scheduled safely.
        loop = asyncio.get_running_loop()

        def _emit_threadsafe(event: str, data: dict):
            """Schedule a Socket.IO emit from any thread."""
            asyncio.run_coroutine_threadsafe(sio.emit(event, data, to=sid), loop)

        voice_agent = VoiceAgent(
            session_id=session_id,
            on_transcript=lambda text, role: _emit_threadsafe(
                "transcript", {"text": text, "role": role}
            ),
            on_audio=lambda audio_b64: _emit_threadsafe(
                "audio", {"data": audio_b64}
            ),
            on_status=lambda status: _emit_threadsafe(
                "status", {"message": status}
            ),
            on_screenshot=lambda img_b64: _emit_threadsafe(
                "screenshot", {"image": img_b64}
            ),
        )

        # Start the BidiAgent (connects to Nova Sonic, spawns event loop)
        await voice_agent.start()

        sessions.add(sid, session_id, voice_agent)
        await sio.emit("session_started", {"session_id": session_id}, to=sid)
        logger.info(f"Session {session_id} started successfully")

    except Exception as e:
        logger.error(f"Failed to start session: {e}")
        await sio.emit("error", {"message": "Failed to start voice session. Please try again."}, to=sid)


@sio.event
async def audio_chunk(sid: str, data: dict):
    """Receive audio chunk from client microphone — forward to BidiAgent."""
    session = sessions.get_by_sid(sid)
    if not session:
        return

    # Data arrives as base64 — pass directly to BidiAgent (no decode needed)
    audio_b64 = data.get("data", "")
    if audio_b64:
        await session["agent"].send_audio(audio_b64)


@sio.event
async def stop_session(sid: str, data: dict = None):
    """Client requests to end the voice session."""
    logger.info(f"Stopping session for {sid}")
    await sessions.cleanup(sid)
    await sio.emit("session_stopped", {}, to=sid)


@sio.event
async def text_input(sid: str, data: dict):
    """Process text input — forward to BidiAgent."""
    session = sessions.get_by_sid(sid)
    if not session:
        await sio.emit("error", {"message": "No active session"}, to=sid)
        return

    text = data.get("text", "")
    if text:
        await session["agent"].send_text(text)


# -- Mount Socket.IO on FastAPI ------------------------------------------------

asgi_app = socket_app  # Combined ASGI app (Socket.IO wrapping FastAPI)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:asgi_app", host="0.0.0.0", port=BACKEND_PORT, reload=True)
