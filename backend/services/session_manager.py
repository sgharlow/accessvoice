"""Manages per-user browser + voice sessions with concurrency limits."""

import logging
from typing import Optional

logger = logging.getLogger("accessvoice.sessions")


class SessionManager:
    def __init__(self, max_sessions: int = 3):
        self.max_sessions = max_sessions
        # sid -> { session_id, agent }
        self._sessions: dict[str, dict] = {}

    @property
    def active_count(self) -> int:
        return len(self._sessions)

    def add(self, sid: str, session_id: str, agent) -> None:
        self._sessions[sid] = {
            "session_id": session_id,
            "agent": agent,
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
