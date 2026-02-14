# backend/tools/browse_extension.py
"""
Browse tool that works with the Chrome extension instead of Nova Act.
Orchestrates: request screenshot -> plan action -> execute action -> repeat.
"""

import json
import logging
import time
import threading

from strands import tool
from strands.types.tools import ToolContext
from tools.action_planner import plan_action

logger = logging.getLogger("accessvoice.tools.browse_extension")

MAX_STEPS = 10
SCREENSHOT_TIMEOUT = 15  # seconds
ACTION_TIMEOUT = 30  # seconds


@tool(context=True)
def browse_website(url: str, task: str, tool_context: ToolContext) -> str:
    """Navigate to a website and perform a task using the user's browser.

    Args:
        url: The website URL to navigate to
        task: What to do on the website (e.g., 'search for apartments in Seattle')

    Returns:
        A summary of what was found or accomplished
    """
    emit_to_client = tool_context.invocation_state.get("emit_to_client")
    screenshot_response = tool_context.invocation_state.get("screenshot_response")
    action_response = tool_context.invocation_state.get("action_response")
    on_status = tool_context.invocation_state.get("on_status")
    on_screenshot = tool_context.invocation_state.get("on_screenshot")

    if not emit_to_client or not screenshot_response or not action_response:
        return "Error: No connection to browser extension. Make sure the extension is installed and connected."

    if on_status:
        on_status(f"Navigating to {url}...")

    # Step 1: Navigate to the URL
    result = _execute_action(emit_to_client, action_response, {
        "action": "navigate",
        "params": {"url": url},
    })

    if not result.get("success"):
        return f"Failed to navigate to {url}: {result.get('error', 'unknown error')}"

    # Wait for page to settle after navigation
    time.sleep(3)

    # Step 2: Iterative action loop
    for step in range(MAX_STEPS):
        if on_status:
            on_status(f"Step {step + 1}: analyzing page...")

        # Request screenshot from extension
        screenshot_data = _request_screenshot(emit_to_client, screenshot_response)
        if not screenshot_data or not screenshot_data.get("image"):
            return "Failed to capture screenshot from browser. Is the extension active?"

        # Push screenshot to frontend
        if on_screenshot:
            on_screenshot(screenshot_data["image"])

        # Request page info from extension
        page_info_data = _execute_action(emit_to_client, action_response, {
            "action": "get_page_info",
            "params": {},
        })
        page_info_str = json.dumps(page_info_data.get("data", {}), indent=2) if page_info_data.get("success") else ""

        # Plan next action using Nova 2 Lite
        if on_status:
            on_status(f"Step {step + 1}: deciding next action...")

        action = plan_action(
            screenshot_b64=screenshot_data["image"],
            goal=task,
            url=screenshot_data.get("url", ""),
            title=screenshot_data.get("title", ""),
            page_info=page_info_str,
        )

        logger.info(f"Step {step + 1}: {action}")

        # Check if done
        if action["action"] == "done":
            return action["params"].get("summary", "Task completed")

        if on_status:
            action_desc = _describe_action(action)
            on_status(f"Step {step + 1}: {action_desc}")

        # Execute the action
        result = _execute_action(emit_to_client, action_response, action)
        if not result.get("success"):
            logger.warning(f"Action failed: {result.get('error')}")
            # Continue — planner will see unchanged page and adjust

        # Brief pause for page to update after action
        time.sleep(2)

    return "Reached maximum steps. Here's what I found so far based on the page."


def _request_screenshot(emit_to_client, screenshot_response, timeout=SCREENSHOT_TIMEOUT):
    """Request screenshot from extension and wait for response."""
    # Clear any stale data
    screenshot_response["data"] = {}
    screenshot_response["event"].clear()

    # Request screenshot
    emit_to_client("request_screenshot", {})

    # Wait for response
    if screenshot_response["event"].wait(timeout=timeout):
        return screenshot_response["data"]

    logger.warning("Screenshot request timed out")
    return None


def _execute_action(emit_to_client, action_response, action, timeout=ACTION_TIMEOUT):
    """Send action to extension and wait for result."""
    # Clear any stale data
    action_response["data"] = {}
    action_response["event"].clear()

    # Send action
    emit_to_client("execute_action", action)

    # Wait for response
    if action_response["event"].wait(timeout=timeout):
        return action_response["data"]

    logger.warning(f"Action timed out: {action.get('action')}")
    return {"success": False, "error": "timeout"}


def _describe_action(action):
    """Human-readable description of an action."""
    a = action["action"]
    p = action.get("params", {})
    if a == "navigate":
        return f"navigating to {p.get('url', '?')}"
    if a == "click":
        return f"clicking {p.get('selector', p.get('text', '?'))}"
    if a == "type":
        return f"typing '{p.get('text', '?')}'"
    if a == "scroll":
        return f"scrolling {p.get('direction', 'down')}"
    if a == "back":
        return "going back"
    return a
