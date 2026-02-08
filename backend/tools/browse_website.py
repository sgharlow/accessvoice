"""browse_website tool — Uses Nova Act to navigate and interact with web pages."""

import base64
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from strands import tool
from strands.types.tools import ToolContext

from config import NOVA_ACT_API_KEY

logger = logging.getLogger("accessvoice.tools.browse")

# Per-session browser instances (managed by session_manager)
_browsers: dict[str, object] = {}
_browsers_lock = threading.Lock()

# Timeout for a single Nova Act step (seconds)
_ACT_STEP_TIMEOUT = 60
# Max retries per step (original + N retries)
_MAX_RETRIES = 2


def _run_with_timeout(fn, timeout_sec: int = _ACT_STEP_TIMEOUT):
    """Run a blocking callable with a timeout. Returns result or raises FuturesTimeout."""
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(fn)
        return future.result(timeout=timeout_sec)


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
        with _browsers_lock:
            browser = _browsers.get(session_id)
        if browser is None:
            if on_status:
                on_status("Starting browser...")
            browser = NovaAct(
                api_key=NOVA_ACT_API_KEY,
                starting_page=url,
            )
            browser.start()
            with _browsers_lock:
                _browsers[session_id] = browser
        else:
            # Navigate to new URL if different
            try:
                _run_with_timeout(lambda: browser.act(f"Navigate to {url}", max_steps=3))
            except FuturesTimeout:
                logger.warning(f"Navigation to {url} timed out")
                if on_status:
                    on_status("Page took too long, retrying...")
                _run_with_timeout(lambda: browser.act(f"Navigate to {url}", max_steps=3))

        # Push initial screenshot
        _push_screenshot(browser, on_screenshot)

        if on_status:
            on_status(f"Working on it: {action[:60]}...")

        # Break complex actions into smaller steps for reliability
        steps = _decompose_action(action)

        for i, step in enumerate(steps):
            step_label = f"Step {i + 1}/{len(steps)}" if len(steps) > 1 else "Working"
            if on_status:
                on_status(f"{step_label}: {step[:50]}...")
            logger.info(f"Executing step {i + 1}: {step}")

            success = _execute_step_with_retries(browser, step, on_status, on_screenshot)

            if not success:
                _push_screenshot(browser, on_screenshot)
                return f"I was able to partially complete the task but got stuck at: {step}. You can ask me to try a different approach."

        # Get final page content for summary
        if on_status:
            on_status("Reading results...")
        page_text = browser.page_content() if hasattr(browser, "page_content") else ""

        return f"Done! I've completed the action on {url}. {_summarize_result(action, page_text)}"

    except ImportError:
        logger.warning("Nova Act not installed — returning mock result for development")
        if on_status:
            on_status("Browsing (dev mode)...")
        time.sleep(1)
        return f"[Dev mode] Would navigate to {url} and {action}. Nova Act SDK not installed."

    except FuturesTimeout:
        logger.error(f"Browse timed out for {url}")
        return f"The page at {url} took too long to respond. Would you like me to try again?"

    except Exception as e:
        logger.error(f"Browse failed: {e}")
        return f"I had trouble accessing {url}. {_friendly_error(e)}"


def _execute_step_with_retries(browser, step: str, on_status, on_screenshot) -> bool:
    """Execute a Nova Act step with retries and timeout. Returns True on success."""
    rephrasings = [
        step,
        f"Try to {step}",
        f"Please {step.lower()}",
    ]

    for attempt, instruction in enumerate(rephrasings[:_MAX_RETRIES + 1]):
        try:
            result = _run_with_timeout(lambda inst=instruction: browser.act(inst, max_steps=5))
            _push_screenshot(browser, on_screenshot)

            if result.success:
                return True

            if attempt < _MAX_RETRIES:
                logger.warning(f"Step failed (attempt {attempt + 1}), retrying: {step}")
                if on_status:
                    on_status("Retrying with different approach...")

        except FuturesTimeout:
            logger.warning(f"Step timed out (attempt {attempt + 1}): {step}")
            if on_status and attempt < _MAX_RETRIES:
                on_status("That took too long, trying again...")

    return False


def _push_screenshot(browser, on_screenshot) -> None:
    """Capture and push a screenshot if callback is available."""
    if not on_screenshot:
        return
    try:
        screenshot = browser.screenshot()
        if screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
            on_screenshot(img_b64)
    except Exception as e:
        logger.debug(f"Screenshot failed: {e}")


def _decompose_action(action: str) -> list[str]:
    """Break a complex action into smaller, more reliable steps."""
    return [action]


def _summarize_result(action: str, page_text: str) -> str:
    """Create a brief summary of what was accomplished."""
    if not page_text:
        return "The action was completed successfully."
    snippet = page_text[:500]
    return f"Here's what I found: {snippet}"


def _friendly_error(e: Exception) -> str:
    """Convert an exception to a speech-friendly error message."""
    msg = str(e).lower()
    if "timeout" in msg or "timed out" in msg:
        return "The page took too long to respond. Would you like me to try again?"
    if "connection" in msg or "network" in msg:
        return "I'm having trouble connecting. Let me try again in a moment."
    if "not found" in msg or "404" in msg:
        return "That page doesn't seem to exist. Could you check the web address?"
    return "Something went wrong. Would you like me to try a different approach?"


def cleanup_browser(session_id: str) -> None:
    """Close and clean up a browser session."""
    with _browsers_lock:
        browser = _browsers.pop(session_id, None)
    if browser:
        try:
            browser.stop()
        except Exception as e:
            logger.error(f"Error closing browser for {session_id}: {e}")
