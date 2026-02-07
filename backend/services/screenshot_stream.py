"""Screenshot capture and streaming service for Nova Act browser sessions."""

import asyncio
import base64
import io
import logging
from typing import Callable, Optional

from PIL import Image

from config import SCREENSHOT_QUALITY, SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT

logger = logging.getLogger("accessvoice.screenshots")


class ScreenshotStream:
    """Captures screenshots from Nova Act and streams them to the frontend."""

    def __init__(self, on_screenshot: Callable[[str], None]):
        self._on_screenshot = on_screenshot
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def compress_screenshot(self, screenshot_bytes: bytes) -> str:
        """Compress a screenshot to JPEG and return base64-encoded string."""
        img = Image.open(io.BytesIO(screenshot_bytes))
        img = img.resize((SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT), Image.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=SCREENSHOT_QUALITY, optimize=True)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    async def push_screenshot(self, screenshot_bytes: bytes) -> None:
        """Push a single screenshot to the frontend."""
        try:
            img_b64 = self.compress_screenshot(screenshot_bytes)
            self._on_screenshot(img_b64)
        except Exception as e:
            logger.error(f"Failed to push screenshot: {e}")

    async def stop(self) -> None:
        """Stop the screenshot streaming loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
