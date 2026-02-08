"""refine_search tool — Adjusts filters/search criteria on the current page via Nova Act."""

import logging
import time
from concurrent.futures import TimeoutError as FuturesTimeout

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
        on_status(f"Adjusting filters: {refinement[:50]}...")

    try:
        from tools.browse_website import _browsers, _run_on_session_thread, _push_screenshot

        browser = _browsers.get(session_id)
        if not browser:
            return "No browser session is active. Please ask me to navigate to a website first."

        # Try with timeout and retries
        rephrasings = [
            f"Adjust the search filters: {refinement}",
            refinement,
        ]

        for attempt, instruction in enumerate(rephrasings):
            try:
                _run_on_session_thread(
                    session_id,
                    lambda inst=instruction: browser.act(inst, max_steps=5),
                )
                _push_screenshot(session_id, browser, on_screenshot)
                # act() returned without raising — success
                if on_status:
                    on_status("Filters updated, reading results...")
                return f"I've updated the search with: {refinement}. Let me read the new results for you."

            except FuturesTimeout:
                logger.warning(f"Refine timed out (attempt {attempt + 1}): {refinement}")
                if on_status:
                    on_status("Taking too long, trying again...")

            except Exception as e:
                logger.warning(f"Refine failed (attempt {attempt + 1}): {refinement} — {e}")
                if attempt == 0:
                    if on_status:
                        on_status("Retrying filter adjustment...")

        return "I had trouble applying that filter. Could you rephrase what you'd like to change?"

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        time.sleep(0.5)
        return f"[Dev mode] Would refine search: {refinement}"

    except Exception as e:
        logger.error(f"Refine search failed: {e}")
        return "I had trouble adjusting the search. Could you tell me what you'd like to change in a different way?"
