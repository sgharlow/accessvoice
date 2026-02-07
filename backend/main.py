"""AccessVoice backend — FastAPI + Socket.IO server for voice-driven web browsing."""

import asyncio
import base64
import json
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
app = FastAPI(title="AccessVoice", version="0.1.0")
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
socket_app = socketio.ASGIApp(sio, other_app=app)

# Session manager
sessions = SessionManager(max_sessions=MAX_CONCURRENT_SESSIONS)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "active_sessions": sessions.active_count,
        "max_sessions": MAX_CONCURRENT_SESSIONS,
    }


# ── Socket.IO Events ──────────────────────────────────────────────


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
        voice_agent = VoiceAgent(
            session_id=session_id,
            on_transcript=lambda text, role: asyncio.create_task(
                sio.emit("transcript", {"text": text, "role": role}, to=sid)
            ),
            on_audio=lambda audio_bytes: asyncio.create_task(
                sio.emit("audio", {"data": base64.b64encode(audio_bytes).decode()}, to=sid)
            ),
            on_status=lambda status: asyncio.create_task(
                sio.emit("status", {"message": status}, to=sid)
            ),
            on_screenshot=lambda img_b64: asyncio.create_task(
                sio.emit("screenshot", {"image": img_b64}, to=sid)
            ),
        )
        sessions.add(sid, session_id, voice_agent)
        await sio.emit("session_started", {"session_id": session_id}, to=sid)
        logger.info(f"Session {session_id} started successfully")

    except Exception as e:
        logger.error(f"Failed to start session: {e}")
        await sio.emit("error", {"message": f"Failed to start session: {str(e)}"}, to=sid)


@sio.event
async def audio_chunk(sid: str, data: dict):
    """Receive audio chunk from client microphone."""
    session = sessions.get_by_sid(sid)
    if not session:
        return

    audio_bytes = base64.b64decode(data["data"])
    await session["agent"].process_audio(audio_bytes)


@sio.event
async def stop_session(sid: str, data: dict = None):
    """Client requests to end the voice session."""
    logger.info(f"Stopping session for {sid}")
    await sessions.cleanup(sid)
    await sio.emit("session_stopped", {}, to=sid)


@sio.event
async def text_input(sid: str, data: dict):
    """Fallback: process text input instead of voice."""
    session = sessions.get_by_sid(sid)
    if not session:
        await sio.emit("error", {"message": "No active session"}, to=sid)
        return

    text = data.get("text", "")
    if text:
        await session["agent"].process_text(text)


# ── Mount Socket.IO on FastAPI ────────────────────────────────────

app = socket_app  # Replace app with the combined ASGI app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=BACKEND_PORT, reload=True)
