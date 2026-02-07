"""refine_search tool — Adjusts filters/search criteria on the current page via Nova Act."""

import asyncio
import base64
import logging
from typing import Callable

from config import NOVA_ACT_API_KEY

logger = logging.getLogger("accessvoice.tools.refine")


async def refine_search(
    session_id: str,
    refinement: str,
    on_screenshot: Callable[[str], None],
    on_status: Callable[[str], None],
    **kwargs,
) -> dict:
    """Modify search filters or criteria on the current page.

    Args:
        session_id: Current session ID
        refinement: Natural language description of what to change
        on_screenshot: Callback for screenshots
        on_status: Callback for status updates

    Returns:
        dict with 'summary' describing what was changed
    """
    on_status(f"Adjusting: {refinement}...")

    try:
        from tools.browse_website import _browsers

        browser = _browsers.get(session_id)
        if not browser:
            return {"summary": "No browser session is active. Please ask me to navigate to a website first."}

        result = browser.act(f"Adjust the search filters: {refinement}", max_steps=5)

        # Push updated screenshot
        screenshot = browser.screenshot()
        if screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
            on_screenshot(img_b64)

        if result.success:
            return {"summary": f"I've updated the search with: {refinement}. Let me read the new results for you."}
        else:
            # Retry with simpler instruction
            on_status("Retrying filter adjustment...")
            result = browser.act(refinement, max_steps=5)

            screenshot = browser.screenshot()
            if screenshot:
                img_b64 = base64.b64encode(screenshot).decode("utf-8")
                on_screenshot(img_b64)

            if result.success:
                return {"summary": f"Done — I've applied the change: {refinement}."}
            else:
                return {"summary": f"I had trouble applying that filter. Could you rephrase what you'd like to change?"}

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        await asyncio.sleep(0.5)
        return {"summary": f"[Dev mode] Would refine search: {refinement}"}

    except Exception as e:
        logger.error(f"Refine search failed: {e}")
        return {"summary": f"I had trouble adjusting the search: {str(e)}"}
