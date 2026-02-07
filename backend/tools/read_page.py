"""read_page tool — Uses Nova 2 Lite to create accessibility-focused page summaries."""

import asyncio
import base64
import json
import logging
from typing import Callable

import boto3

from config import AWS_REGION, NOVA_LITE_MODEL_ID

logger = logging.getLogger("accessvoice.tools.read_page")

VISION_PROMPT = """You are an accessibility assistant helping a visually impaired user understand a web page.

Analyze this screenshot and provide a clear, structured summary:

1. **Page Identity**: What website/page is this? (e.g., "Zillow search results for Seattle apartments")
2. **Key Content**: Summarize the main content in natural speech-friendly format:
   - For search results: list items with the most important details (price, title, location)
   - For articles: headline and key points
   - For product pages: name, price, rating, availability
3. **Available Actions**: What can the user do next? (e.g., "click on a result", "apply filters", "go to next page")

Keep it concise but complete. Speak naturally — this will be read aloud.
Focus on: {focus}"""


async def read_page(
    session_id: str,
    on_screenshot: Callable[[str], None],
    on_status: Callable[[str], None],
    focus: str = "main content",
    **kwargs,
) -> dict:
    """Analyze the current page screenshot using Nova 2 Lite vision.

    Args:
        session_id: Current session ID
        focus: What aspect of the page to focus on
        on_screenshot: Callback for screenshots
        on_status: Callback for status updates

    Returns:
        dict with 'summary' containing the accessibility-focused description
    """
    on_status("Reading page content...")

    try:
        from tools.browse_website import _browsers

        browser = _browsers.get(session_id)
        if not browser:
            return {"summary": "No browser session is active. Please ask me to navigate to a website first."}

        # Get screenshot
        screenshot = browser.screenshot()
        if not screenshot:
            return {"summary": "I couldn't capture the current page. Please try again."}

        # Push screenshot to frontend
        img_b64 = base64.b64encode(screenshot).decode("utf-8")
        on_screenshot(img_b64)

        # Send to Nova 2 Lite for vision analysis
        bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)

        response = bedrock.converse(
            modelId=NOVA_LITE_MODEL_ID,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "image": {
                                "format": "jpeg",
                                "source": {"bytes": screenshot},
                            }
                        },
                        {"text": VISION_PROMPT.format(focus=focus)},
                    ],
                }
            ],
            inferenceConfig={"maxTokens": 1024, "temperature": 0.3},
        )

        # Extract text response
        output = response.get("output", {})
        message = output.get("message", {})
        content = message.get("content", [])
        summary = ""
        for block in content:
            if "text" in block:
                summary += block["text"]

        return {"summary": summary or "I couldn't read the page content."}

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        await asyncio.sleep(0.5)
        return {"summary": f"[Dev mode] Would analyze page with focus on: {focus}"}

    except Exception as e:
        logger.error(f"Read page failed: {e}")
        return {"summary": f"I had trouble reading the page: {str(e)}"}
