"""Voice agent — orchestrates Nova Sonic for bidirectional voice conversation.

Uses Strands BidiAgent with BidiNovaSonicModel for real-time speech-to-speech.
Tool calls (browse, read_page, etc.) are triggered mid-conversation by voice commands.
"""

import asyncio
import base64
import logging
import time
from typing import Callable, Optional

from strands.experimental.bidi import (
    BidiAgent,
    BidiAudioInputEvent,
    BidiTextInputEvent,
    stop_conversation,
)
from strands.experimental.bidi.models.nova_sonic import BidiNovaSonicModel
from strands.types._events import ToolUseStreamEvent, ToolResultEvent

from config import (
    NOVA_SONIC_REGION,
    NOVA_SONIC_MODEL_ID,
    VOICE_ID,
    AUDIO_SAMPLE_RATE,
    AUDIO_CHANNELS,
    AUDIO_FORMAT,
    SYSTEM_PROMPT,
)
from tools.browse_website import browse_website
from tools.read_page import read_page
from tools.refine_search import refine_search
from tools.navigate_back import navigate_back

logger = logging.getLogger("accessvoice.voice")

# Friendly tool names for status updates
_TOOL_LABELS = {
    "browse_website": "Browsing the web",
    "read_page": "Reading the page",
    "refine_search": "Adjusting search",
    "navigate_back": "Going back",
    "stop_conversation": "Ending conversation",
}


class VoiceAgent:
    """Manages a Nova Sonic bidirectional voice session with tool calling."""

    def __init__(
        self,
        session_id: str,
        on_transcript: Callable[[str, str], None],
        on_audio: Callable[[str], None],
        on_status: Callable[[str], None],
        on_screenshot: Callable[[str], None],
    ):
        self.session_id = session_id
        self._on_transcript = on_transcript
        self._on_audio = on_audio
        self._on_status = on_status
        self._on_screenshot = on_screenshot
        self._receive_task: Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None
        self._closed = False
        self._last_activity = time.monotonic()

        # Pre-compute a 100ms silent audio frame (16kHz, 16-bit mono = 3200 bytes)
        self._silence_b64 = base64.b64encode(b"\x00" * 3200).decode("utf-8")

        # Build the BidiNovaSonicModel targeting us-east-1
        self._model = BidiNovaSonicModel(
            model_id=NOVA_SONIC_MODEL_ID,
            provider_config={
                "audio": {
                    "input_rate": AUDIO_SAMPLE_RATE,
                    "output_rate": AUDIO_SAMPLE_RATE,
                    "channels": AUDIO_CHANNELS,
                    "format": AUDIO_FORMAT,
                    "voice": VOICE_ID,
                },
                "inference": {
                    "max_tokens": 1024,
                    "temperature": 0.7,
                },
            },
            client_config={
                "region": NOVA_SONIC_REGION,
            },
        )

        # Build the BidiAgent with all 4 tools
        self._agent = BidiAgent(
            model=self._model,
            tools=[browse_website, read_page, refine_search, navigate_back, stop_conversation],
            system_prompt=SYSTEM_PROMPT,
        )

    @property
    def idle_seconds(self) -> float:
        """Seconds since last activity (audio/text input)."""
        return time.monotonic() - self._last_activity

    async def start(self) -> None:
        """Start the BidiAgent connection and spawn the event receive loop."""
        self._on_status("Connecting to Nova Sonic...")

        try:
            await self._agent.start(invocation_state={
                "session_id": self.session_id,
                "on_screenshot": self._on_screenshot,
                "on_status": self._on_status,
            })
            # Spawn background receive loop and audio keepalive
            self._receive_task = asyncio.create_task(self._event_loop())
            self._keepalive_task = asyncio.create_task(self._audio_keepalive())
            logger.info(f"BidiAgent started for session {self.session_id}")

        except Exception as e:
            logger.error(f"Failed to start BidiAgent: {e}")
            self._on_status("Connection failed. Please try again.")
            raise

    async def _event_loop(self) -> None:
        """Async receive loop — maps BidiAgent events to Socket.IO callbacks."""
        try:
            async for event in self._agent.receive():
                event_type = event.get("type", "")

                if event_type == "bidi_connection_start":
                    self._on_status("Connected — listening...")
                    logger.info(f"Nova Sonic connected: {event.get('connection_id', '')}")

                elif event_type == "bidi_audio_stream":
                    # Forward base64-encoded audio chunk to client
                    audio_b64 = event.get("audio", "")
                    if audio_b64:
                        self._on_audio(audio_b64)

                elif event_type == "bidi_transcript_stream":
                    text = event.get("text", "")
                    role = event.get("role", "assistant")
                    is_final = event.get("is_final", False)
                    if text and is_final:
                        self._on_transcript(text, role)

                elif event_type == "bidi_connection_restart":
                    self._on_status("Reconnecting — one moment...")
                    logger.info("Nova Sonic connection restarting (8-min timeout)")

                elif event_type == "bidi_interruption":
                    self._on_status("Listening...")

                elif event_type == "bidi_response_complete":
                    self._on_status("Listening...")

                elif event_type == "bidi_error":
                    error_msg = event.get("message", "Unknown error")
                    logger.error(f"BidiAgent error: {error_msg}")
                    # Show user-friendly message instead of raw error
                    if "timeout" in error_msg.lower():
                        self._on_status("Connection timed out. Reconnecting...")
                    elif "throttl" in error_msg.lower():
                        self._on_status("Service busy — retrying...")
                    else:
                        self._on_status("Something went wrong. Still listening...")

                elif event_type == "bidi_connection_close":
                    reason = event.get("reason", "unknown")
                    logger.info(f"BidiAgent connection closed: {reason}")
                    if reason == "user_request":
                        self._on_status("Conversation ended")
                    break

                elif isinstance(event, ToolUseStreamEvent):
                    tool_use = event.get("current_tool_use", {})
                    tool_name = tool_use.get("name", "")
                    label = _TOOL_LABELS.get(tool_name, tool_name)
                    self._on_status(f"{label}...")

                elif isinstance(event, ToolResultEvent):
                    self._on_status("Preparing response...")

        except asyncio.CancelledError:
            logger.info(f"Event loop cancelled for session {self.session_id}")
        except Exception as e:
            logger.error(f"Event loop error for session {self.session_id}: {e}")
            if not self._closed:
                self._on_status("Connection lost. Please restart the session.")

    async def _audio_keepalive(self) -> None:
        """Send silent audio frames to keep the Nova Sonic connection alive.

        Nova Sonic requires continuous audio input — without it the stream
        times out. This sends 100ms of silence every 200ms when no real
        audio is flowing.
        """
        try:
            while True:
                await asyncio.sleep(0.2)
                await self._agent.send(BidiAudioInputEvent(
                    audio=self._silence_b64,
                    format=AUDIO_FORMAT,
                    sample_rate=AUDIO_SAMPLE_RATE,
                    channels=AUDIO_CHANNELS,
                ))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug(f"Keepalive stopped: {e}")

    async def send_audio(self, audio_b64: str) -> None:
        """Forward base64-encoded PCM audio from the client microphone to BidiAgent."""
        self._last_activity = time.monotonic()
        try:
            await self._agent.send(BidiAudioInputEvent(
                audio=audio_b64,
                format=AUDIO_FORMAT,
                sample_rate=AUDIO_SAMPLE_RATE,
                channels=AUDIO_CHANNELS,
            ))
        except Exception as e:
            logger.error(f"Error sending audio: {e}")

    async def send_text(self, text: str) -> None:
        """Forward text input to BidiAgent."""
        self._last_activity = time.monotonic()
        try:
            await self._agent.send(BidiTextInputEvent(text=text, role="user"))
        except Exception as e:
            logger.error(f"Error sending text: {e}")

    async def close(self) -> None:
        """Clean up the voice session."""
        self._closed = True

        # Cancel background tasks
        for task in (self._keepalive_task, self._receive_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        # Stop the BidiAgent
        try:
            await self._agent.stop()
        except Exception as e:
            logger.error(f"Error stopping BidiAgent: {e}")

        # Clean up browser session (may block — run in thread)
        from tools.browse_website import cleanup_browser
        await asyncio.to_thread(cleanup_browser, self.session_id)

        logger.info(f"Voice agent closed for session {self.session_id}")
