# backend/tools/action_planner.py
"""
Action Planner — replaces Nova Act with vision-based browser action planning.

Given a screenshot of the user's browser tab and their intent,
uses Nova 2 Lite to determine what DOM action to execute next.
Returns structured action commands for the extension content script.
"""

import json
import base64
import boto3
import logging
from botocore.config import Config as BotoConfig
from config import NOVA_LITE_REGION, NOVA_LITE_MODEL_ID

logger = logging.getLogger("accessvoice.tools.action_planner")

ACTION_PLANNER_PROMPT = """You are a browser automation assistant. Given a screenshot of a webpage and the user's goal, determine the SINGLE next action to take.

User's goal: {goal}
Current URL: {url}
Page title: {title}

Available page elements:
{page_info}

Respond with ONLY a JSON object (no markdown, no explanation) in one of these formats:

To navigate to a URL:
{{"action": "navigate", "params": {{"url": "https://..."}}}}

To click an element:
{{"action": "click", "params": {{"selector": "CSS selector"}}}}

To type text into an input:
{{"action": "type", "params": {{"selector": "CSS selector", "text": "text to type", "pressEnter": true}}}}

To scroll the page:
{{"action": "scroll", "params": {{"direction": "down", "amount": 500}}}}

To go back:
{{"action": "back", "params": {{}}}}

If the goal is complete (results are visible), respond:
{{"action": "done", "params": {{"summary": "Brief description of what was found"}}}}

Choose the most effective single action to make progress toward the goal."""


_bedrock_client = None

def _get_bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client(
            "bedrock-runtime",
            region_name=NOVA_LITE_REGION,
            config=BotoConfig(
                read_timeout=30,
                connect_timeout=10,
                retries={"max_attempts": 2, "mode": "adaptive"},
            ),
        )
    return _bedrock_client


def plan_action(screenshot_b64: str, goal: str, url: str = "", title: str = "", page_info: str = "") -> dict:
    """
    Analyze screenshot and determine next browser action.

    Args:
        screenshot_b64: Base64-encoded JPEG screenshot
        goal: User's browsing intent
        url: Current page URL
        title: Current page title
        page_info: JSON string of available page elements

    Returns:
        dict with 'action' and 'params' keys
    """
    bedrock = _get_bedrock()
    screenshot_bytes = base64.b64decode(screenshot_b64)

    prompt = ACTION_PLANNER_PROMPT.format(
        goal=goal,
        url=url,
        title=title,
        page_info=page_info or "Not available",
    )

    try:
        response = bedrock.converse(
            modelId=NOVA_LITE_MODEL_ID,
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": "jpeg", "source": {"bytes": screenshot_bytes}}},
                    {"text": prompt},
                ],
            }],
            inferenceConfig={"maxTokens": 500, "temperature": 0.1},
        )

        result_text = response["output"]["message"]["content"][0]["text"].strip()

        # Parse JSON from response (handle markdown code blocks)
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
            result_text = result_text.strip()

        action = json.loads(result_text)
        logger.info(f"Action planned: {action['action']} for goal: {goal[:50]}")
        return action

    except Exception as e:
        logger.error(f"Action planning failed: {e}")
        return {"action": "done", "params": {"summary": f"I had trouble analyzing the page: {str(e)}"}}
