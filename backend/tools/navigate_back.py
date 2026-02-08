"""navigate_back tool — Goes back to the previous page in the browser."""

import logging
import time
from concurrent.futures import TimeoutError as FuturesTimeout

from strands import tool
from strands.types.tools import ToolContext

logger = logging.getLogger("accessvoice.tools.navigate_back")


@tool(context=True)
def navigate_back(tool_context: ToolContext) -> str:
    """Go back to the previous page in the browser.

    Returns:
        Description of the result.
    """
    session_id = tool_context.invocation_state.get("session_id", "")
    on_screenshot = tool_context.invocation_state.get("on_screenshot")
    on_status = tool_context.invocation_state.get("on_status")

    if on_status:
        on_status("Going back to previous page...")

    try:
        from tools.browse_website import _browsers, _run_on_session_thread, _push_screenshot

        browser = _browsers.get(session_id)
        if not browser:
            return "No browser session is active. Please ask me to navigate to a website first."

        try:
            result = _run_on_session_thread(
                session_id,
                lambda: browser.act("Go back to the previous page", max_steps=2),
                timeout_sec=30,
            )
        except FuturesTimeout:
            logger.warning("Navigate back timed out, retrying")
            if on_status:
                on_status("Taking a moment, trying again...")
            result = _run_on_session_thread(
                session_id,
                lambda: browser.act("Click the browser back button", max_steps=2),
                timeout_sec=30,
            )

        _push_screenshot(session_id, browser, on_screenshot)

        if result.success:
            return "I've gone back to the previous page. Would you like me to read what's on this page?"
        else:
            return "I had trouble going back. Would you like me to navigate to a specific website instead?"

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        time.sleep(0.3)
        return "[Dev mode] Would navigate back to previous page."

    except FuturesTimeout:
        return "Going back took too long. Would you like me to navigate to a specific page instead?"

    except Exception as e:
        logger.error(f"Navigate back failed: {e}")
        return "I had trouble going back. Would you like me to navigate to a specific website instead?"
