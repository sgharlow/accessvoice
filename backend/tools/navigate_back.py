"""navigate_back tool — Goes back to the previous page in the browser."""

import base64
import logging
import time

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
        on_status("Going back...")

    try:
        from tools.browse_website import _browsers

        browser = _browsers.get(session_id)
        if not browser:
            return "No browser session is active. Please ask me to navigate to a website first."

        result = browser.act("Go back to the previous page", max_steps=2)

        # Push screenshot of previous page
        screenshot = browser.screenshot()
        if screenshot and on_screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
            on_screenshot(img_b64)

        if result.success:
            return "I've gone back to the previous page. Would you like me to read what's on this page?"
        else:
            return "I had trouble going back. Would you like me to navigate to a specific website instead?"

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        time.sleep(0.3)
        return "[Dev mode] Would navigate back to previous page."

    except Exception as e:
        logger.error(f"Navigate back failed: {e}")
        return f"I had trouble going back: {str(e)}"
