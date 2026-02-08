"""Manages per-user browser + voice sessions with concurrency limits."""

import asyncio
import logging
import time
from typing import Optional

from config import SESSION_IDLE_TIMEOUT

logger = logging.getLogger("accessvoice.sessions")


class SessionManager:
    def __init__(self, max_sessions: int = 3):
        self.max_sessions = max_sessions
        # sid -> { session_id, agent, created_at }
        self._sessions: dict[str, dict] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    @property
    def active_count(self) -> int:
        return len(self._sessions)

    def start_cleanup_loop(self) -> None:
        """Start the background stale session cleanup loop."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._stale_session_loop())
            logger.info("Stale session cleanup loop started")

    def add(self, sid: str, session_id: str, agent) -> None:
        self._sessions[sid] = {
            "session_id": session_id,
            "agent": agent,
            "created_at": time.monotonic(),
        }
        logger.info(f"Session added: {session_id} ({self.active_count}/{self.max_sessions})")

    def get_by_sid(self, sid: str) -> Optional[dict]:
        return self._sessions.get(sid)

    async def cleanup(self, sid: str) -> None:
        session = self._sessions.pop(sid, None)
        if session:
            try:
                await session["agent"].close()
            except Exception as e:
                logger.error(f"Error closing session {session['session_id']}: {e}")
            logger.info(f"Session cleaned up: {session['session_id']} ({self.active_count}/{self.max_sessions})")

    async def cleanup_all(self) -> None:
        """Clean up all sessions (used on shutdown)."""
        sids = list(self._sessions.keys())
        for sid in sids:
            await self.cleanup(sid)
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

    async def _stale_session_loop(self) -> None:
        """Periodically check for and clean up idle sessions."""
        try:
            while True:
                await asyncio.sleep(60)  # Check every minute
                stale_sids = []
                for sid, session in self._sessions.items():
                    agent = session["agent"]
                    if hasattr(agent, "idle_seconds") and agent.idle_seconds > SESSION_IDLE_TIMEOUT:
                        stale_sids.append(sid)
                        logger.info(
                            f"Session {session['session_id']} idle for "
                            f"{agent.idle_seconds:.0f}s — marking for cleanup"
                        )

                for sid in stale_sids:
                    logger.info(f"Auto-cleaning stale session for sid {sid}")
                    await self.cleanup(sid)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Stale session cleanup error: {e}")
