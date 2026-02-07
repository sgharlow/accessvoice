"""browse_website tool — Uses Nova Act to navigate and interact with web pages."""

import asyncio
import base64
import logging
from typing import Callable

from config import NOVA_ACT_API_KEY

logger = logging.getLogger("accessvoice.tools.browse")

# Per-session browser instances (managed by session_manager)
_browsers: dict[str, object] = {}


async def browse_website(
    session_id: str,
    url: str,
    action: str,
    on_screenshot: Callable[[str], None],
    on_status: Callable[[str], None],
    **kwargs,
) -> dict:
    """Navigate to a URL and perform an action using Nova Act.

    Args:
        session_id: Current session ID for browser persistence
        url: Website URL to navigate to
        action: Natural language description of what to do
        on_screenshot: Callback to push screenshots to frontend
        on_status: Callback to push status updates

    Returns:
        dict with 'summary' key containing action result description
    """
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
        if screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
            on_screenshot(img_b64)

        on_status(f"Performing: {action}...")

        # Break complex actions into smaller steps for reliability
        # Nova Act has ~90% success per step; smaller steps = higher overall success
        steps = _decompose_action(action)

        for i, step in enumerate(steps):
            on_status(f"Step {i + 1}/{len(steps)}: {step[:50]}...")
            logger.info(f"Executing step {i + 1}: {step}")

            result = browser.act(step, max_steps=5)

            # Push screenshot after each step
            screenshot = browser.screenshot()
            if screenshot:
                img_b64 = base64.b64encode(screenshot).decode("utf-8")
                on_screenshot(img_b64)

            if not result.success:
                # Retry once with rephrased instruction
                logger.warning(f"Step failed, retrying: {step}")
                on_status(f"Retrying step {i + 1}...")
                result = browser.act(f"Try to {step}", max_steps=5)

                if not result.success:
                    return {"summary": f"I was able to partially complete the task. I got stuck at: {step}"}

        # Get final page content for summary
        on_status("Reading page content...")
        page_text = browser.page_content() if hasattr(browser, 'page_content') else ""

        return {
            "summary": f"I've completed the action on {url}. {_summarize_result(action, page_text)}",
        }

    except ImportError:
        logger.warning("Nova Act not installed — returning mock result for development")
        on_status("Browsing (dev mode)...")
        await asyncio.sleep(1)
        return {
            "summary": f"[Dev mode] Would navigate to {url} and {action}. Nova Act SDK not installed.",
        }

    except Exception as e:
        logger.error(f"Browse failed: {e}")
        return {"summary": f"I had trouble accessing {url}: {str(e)}"}


def _decompose_action(action: str) -> list[str]:
    """Break a complex action into smaller, more reliable steps.

    Nova Act succeeds ~90% per step. With 3 steps and retry:
    Success rate = 1 - (1 - 0.9^3) * (1 - 0.9^3) ≈ 99.5%
    """
    # For now, return as single action. Phase 2 will add smart decomposition.
    # Complex actions will be broken down by the LLM or by heuristics.
    return [action]


def _summarize_result(action: str, page_text: str) -> str:
    """Create a brief summary of what was accomplished."""
    if not page_text:
        return "The action was completed successfully."
    # Truncate for summary
    snippet = page_text[:500]
    return f"Here's what I found: {snippet}"


async def cleanup_browser(session_id: str) -> None:
    """Close and clean up a browser session."""
    browser = _browsers.pop(session_id, None)
    if browser:
        try:
            browser.stop()
        except Exception as e:
            logger.error(f"Error closing browser for {session_id}: {e}")
