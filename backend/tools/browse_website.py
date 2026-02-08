"""browse_website tool — Uses Nova Act to navigate and interact with web pages."""

import base64
import logging
import time

from strands import tool
from strands.types.tools import ToolContext

from config import NOVA_ACT_API_KEY

logger = logging.getLogger("accessvoice.tools.browse")

# Per-session browser instances (managed by session_manager)
_browsers: dict[str, object] = {}


@tool(context=True)
def browse_website(url: str, action: str, tool_context: ToolContext) -> str:
    """Navigate to a website URL and perform actions like clicking, typing, or scrolling.

    Use this when the user wants to visit a website or interact with page elements.

    Args:
        url: The URL to navigate to. Include https://. Examples: https://zillow.com, https://amazon.com
        action: What to do on the page. Be specific. Examples: 'search for 3 bedroom apartments in Seattle under $2000', 'click on the first result', 'scroll down to see more results'

    Returns:
        Summary of what happened on the page.
    """
    session_id = tool_context.invocation_state.get("session_id", "")
    on_screenshot = tool_context.invocation_state.get("on_screenshot")
    on_status = tool_context.invocation_state.get("on_status")

    if on_status:
        on_status(f"Opening {url}...")

    try:
        from nova_act import NovaAct

        # Get or create browser for this session
        browser = _browsers.get(session_id)
        if browser is None:
            browser = NovaAct(
                api_key=NOVA_ACT_API_KEY,
                starting_page=url,
            )
            browser.start()
            _browsers[session_id] = browser
        else:
            # Navigate to new URL if different
            browser.act(f"Navigate to {url}", max_steps=3)

        # Push initial screenshot
        screenshot = browser.screenshot()
        if screenshot and on_screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
            on_screenshot(img_b64)

        if on_status:
            on_status(f"Performing: {action}...")

        # Break complex actions into smaller steps for reliability
        steps = _decompose_action(action)

        for i, step in enumerate(steps):
            if on_status:
                on_status(f"Step {i + 1}/{len(steps)}: {step[:50]}...")
            logger.info(f"Executing step {i + 1}: {step}")

            result = browser.act(step, max_steps=5)

            # Push screenshot after each step
            screenshot = browser.screenshot()
            if screenshot and on_screenshot:
                img_b64 = base64.b64encode(screenshot).decode("utf-8")
                on_screenshot(img_b64)

            if not result.success:
                # Retry once with rephrased instruction
                logger.warning(f"Step failed, retrying: {step}")
                if on_status:
                    on_status(f"Retrying step {i + 1}...")
                result = browser.act(f"Try to {step}", max_steps=5)

                if not result.success:
                    return f"I was able to partially complete the task. I got stuck at: {step}"

        # Get final page content for summary
        if on_status:
            on_status("Reading page content...")
        page_text = browser.page_content() if hasattr(browser, "page_content") else ""

        return f"I've completed the action on {url}. {_summarize_result(action, page_text)}"

    except ImportError:
        logger.warning("Nova Act not installed — returning mock result for development")
        if on_status:
            on_status("Browsing (dev mode)...")
        time.sleep(1)
        return f"[Dev mode] Would navigate to {url} and {action}. Nova Act SDK not installed."

    except Exception as e:
        logger.error(f"Browse failed: {e}")
        return f"I had trouble accessing {url}: {str(e)}"


def _decompose_action(action: str) -> list[str]:
    """Break a complex action into smaller, more reliable steps."""
    return [action]


def _summarize_result(action: str, page_text: str) -> str:
    """Create a brief summary of what was accomplished."""
    if not page_text:
        return "The action was completed successfully."
    snippet = page_text[:500]
    return f"Here's what I found: {snippet}"


def cleanup_browser(session_id: str) -> None:
    """Close and clean up a browser session."""
    browser = _browsers.pop(session_id, None)
    if browser:
        try:
            browser.stop()
        except Exception as e:
            logger.error(f"Error closing browser for {session_id}: {e}")
