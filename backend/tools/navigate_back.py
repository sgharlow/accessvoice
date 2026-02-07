"""navigate_back tool — Goes back to the previous page in the browser."""

import asyncio
import base64
import logging
from typing import Callable

logger = logging.getLogger("accessvoice.tools.navigate_back")


async def navigate_back(
    session_id: str,
    on_screenshot: Callable[[str], None],
    on_status: Callable[[str], None],
    **kwargs,
) -> dict:
    """Navigate back to the previous page.

    Args:
        session_id: Current session ID
        on_screenshot: Callback for screenshots
        on_status: Callback for status updates

    Returns:
        dict with 'summary' describing the result
    """
    on_status("Going back...")

    try:
        from tools.browse_website import _browsers

        browser = _browsers.get(session_id)
        if not browser:
            return {"summary": "No browser session is active. Please ask me to navigate to a website first."}

        result = browser.act("Go back to the previous page", max_steps=2)

        # Push screenshot of previous page
        screenshot = browser.screenshot()
        if screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
            on_screenshot(img_b64)

        if result.success:
            return {"summary": "I've gone back to the previous page. Would you like me to read what's on this page?"}
        else:
            return {"summary": "I had trouble going back. Would you like me to navigate to a specific website instead?"}

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        await asyncio.sleep(0.3)
        return {"summary": "[Dev mode] Would navigate back to previous page."}

    except Exception as e:
        logger.error(f"Navigate back failed: {e}")
        return {"summary": f"I had trouble going back: {str(e)}"}
