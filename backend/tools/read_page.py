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
    session_id = tool_context.invocation_state.get("session_id", "")
    on_screenshot = tool_context.invocation_state.get("on_screenshot")
    on_status = tool_context.invocation_state.get("on_status")

    if on_status:
        on_status("Reading page content...")

    try:
        from tools.browse_website import _browsers, _run_on_session_thread

        browser = _browsers.get(session_id)
        if not browser:
            return "No browser session is active. Please ask me to navigate to a website first."

        # Get screenshot via Playwright page API on the session thread
        # Use JPEG format to match Nova 2 Lite's expected input
        screenshot = _run_on_session_thread(
            session_id,
            lambda: browser.page.screenshot(type="jpeg", quality=80),
            timeout_sec=10,
        )
        if not screenshot:
            return "I couldn't capture the current page. Please try again."

        # Push screenshot to frontend
        if on_screenshot:
            img_b64 = base64.b64encode(screenshot).decode("utf-8")
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

    except ImportError:
        logger.warning("Nova Act not available — dev mode")
        return f"[Dev mode] Would analyze page with focus on: {focus}"

    except Exception as e:
        logger.error(f"Read page failed: {e}")
        err_msg = str(e).lower()
        if "timeout" in err_msg or "timed out" in err_msg:
            return "The page analysis took too long. Would you like me to try reading a specific section?"
        if "throttl" in err_msg:
            return "The service is busy right now. Let me try again in a moment."
        return "I had trouble reading the page. Would you like me to try again?"
