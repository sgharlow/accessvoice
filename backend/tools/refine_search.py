"""refine_search tool — Adjusts filters/search criteria on the current page via Nova Act."""

import base64
import logging
import time

from strands import tool
from strands.types.tools import ToolContext

logger = logging.getLogger("accessvoice.tools.refine")


@tool(context=True)
def refine_search(refinement: str, tool_context: ToolContext) -> str:
    """Modify search filters or criteria on the current page.

    Use this when the user wants to narrow or change their search.

    Args:
        refinement: What to change. Examples: 'increase max price to $2500', 'filter by 2+ bathrooms', 'sort by lowest price'

    Returns:
        Description of what was changed.
    """
    session_id = tool_context.invocation_state.get("session_id", "")
    on_screenshot = tool_context.invocation_state.get("on_screenshot")
    on_status = tool_context.invocation_state.get("on_status")

    if on_status:
        on_status(f"Adjusting: {refinement}...")

    try:
        from tools.browse_website import _browsers

        browser = _browsers.get(session_id)
        if not browser:
            return "No browser session is active. Please ask me to navigate to a website first."

        result = browser.act(f"Adjust the search filters: {refinement}", max_steps=5)

        # Push updated screenshot
        screenshot = browser.screenshot()
        if screenshot and on_screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
            on_screenshot(img_b64)

        if result.success:
            return f"I've updated the search with: {refinement}. Let me read the new results for you."
        else:
            # Retry with simpler instruction
            if on_status:
                on_status("Retrying filter adjustment...")
            result = browser.act(refinement, max_steps=5)

            screenshot = browser.screenshot()
            if screenshot and on_screenshot:
                img_b64 = base64.b64encode(screenshot).decode("utf-8")
                on_screenshot(img_b64)

            if result.success:
                return f"Done — I've applied the change: {refinement}."
            else:
                return "I had trouble applying that filter. Could you rephrase what you'd like to change?"

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        time.sleep(0.5)
        return f"[Dev mode] Would refine search: {refinement}"

    except Exception as e:
        logger.error(f"Refine search failed: {e}")
        return f"I had trouble adjusting the search: {str(e)}"
