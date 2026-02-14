"""read_page tool — Uses Nova 2 Lite to create accessibility-focused page summaries."""

import base64
import logging

import boto3
from botocore.config import Config as BotoConfig
from strands import tool
from strands.types.tools import ToolContext

from config import NOVA_LITE_REGION, NOVA_LITE_MODEL_ID

logger = logging.getLogger("accessvoice.tools.read_page")

# Timeout for Bedrock vision call (seconds)
_VISION_TIMEOUT = 30

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


@tool(context=True)
def read_page(focus: str = "main content", tool_context: ToolContext = None) -> str:
    """Get an accessibility-focused summary of the current page content.

    Use this to read results, articles, or any page content back to the user.

    Args:
        focus: What aspect of the page to focus on. Examples: 'search results', 'article content', 'product details', 'navigation options'

    Returns:
        Accessibility-focused description of the page.
    """
    on_screenshot = tool_context.invocation_state.get("on_screenshot")
    on_status = tool_context.invocation_state.get("on_status")
    emit_to_client = tool_context.invocation_state.get("emit_to_client")
    screenshot_response = tool_context.invocation_state.get("screenshot_response")

    if on_status:
        on_status("Reading page content...")

    try:
        if not emit_to_client or not screenshot_response:
            return "No connection to browser extension. Make sure the extension is installed and connected."

        # Request screenshot from extension
        screenshot_response["data"] = {}
        screenshot_response["event"].clear()
        emit_to_client("request_screenshot", {})

        if not screenshot_response["event"].wait(timeout=15):
            return "I couldn't capture the current page. Please try again."

        screenshot_data = screenshot_response["data"]
        img_b64 = screenshot_data.get("image")
        if not img_b64:
            return "I couldn't capture the current page. Please try again."

        screenshot = base64.b64decode(img_b64)

        # Push screenshot to frontend
        if on_screenshot:
            on_screenshot(img_b64)

        if on_status:
            on_status("Analyzing page content...")

        # Send to Nova 2 Lite for vision analysis (us-west-2) with timeout
        bedrock = boto3.client(
            "bedrock-runtime",
            region_name=NOVA_LITE_REGION,
            config=BotoConfig(
                read_timeout=_VISION_TIMEOUT,
                connect_timeout=10,
                retries={"max_attempts": 2, "mode": "adaptive"},
            ),
        )

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

        if on_status:
            on_status("Responding...")

        return summary or "I couldn't read the page content. Let me try again."

    except Exception as e:
        logger.error(f"Read page failed: {e}")
        err_msg = str(e).lower()
        if "timeout" in err_msg or "timed out" in err_msg:
            return "The page analysis took too long. Would you like me to try reading a specific section?"
        if "throttl" in err_msg:
            return "The service is busy right now. Let me try again in a moment."
        return "I had trouble reading the page. Would you like me to try again?"
