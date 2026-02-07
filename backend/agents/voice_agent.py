"""Voice agent — orchestrates Nova Sonic for bidirectional voice conversation.

Uses Strands BidiAgent with Nova Sonic for real-time voice interaction.
Tool calls (browse, read_page, etc.) are triggered by voice commands.
"""

import asyncio
import json
import logging
from typing import Callable, Optional

import boto3

from config import (
    AWS_REGION,
    NOVA_SONIC_MODEL_ID,
    VOICE_ID,
    SYSTEM_PROMPT,
)

logger = logging.getLogger("accessvoice.voice")


class VoiceAgent:
    """Manages a Nova Sonic bidirectional voice session with tool calling."""

    def __init__(
        self,
        session_id: str,
        on_transcript: Callable[[str, str], None],
        on_audio: Callable[[bytes], None],
        on_status: Callable[[str], None],
        on_screenshot: Callable[[str], None],
    ):
        self.session_id = session_id
        self._on_transcript = on_transcript
        self._on_audio = on_audio
        self._on_status = on_status
        self._on_screenshot = on_screenshot

        self._bedrock = boto3.client(
            "bedrock-runtime",
            region_name=AWS_REGION,
        )
        self._stream = None
        self._is_active = False
        self._audio_buffer = bytearray()

        # Tool definitions for Nova Sonic
        self._tools = [
            {
                "toolSpec": {
                    "name": "browse_website",
                    "description": "Navigate to a website URL and perform actions like clicking, typing, or scrolling. Use this when the user wants to visit a website or interact with page elements.",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {
                                "url": {
                                    "type": "string",
                                    "description": "The URL to navigate to. Include https://. Examples: https://zillow.com, https://amazon.com",
                                },
                                "action": {
                                    "type": "string",
                                    "description": "What to do on the page. Be specific. Examples: 'search for 3 bedroom apartments in Seattle under $2000', 'click on the first result', 'scroll down to see more results'",
                                },
                            },
                            "required": ["url", "action"],
                        }
                    },
                }
            },
            {
                "toolSpec": {
                    "name": "read_page",
                    "description": "Get an accessibility-focused summary of the current page content. Use this to read results, articles, or any page content back to the user.",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {
                                "focus": {
                                    "type": "string",
                                    "description": "What aspect to focus on. Examples: 'search results', 'article content', 'product details', 'navigation options'",
                                },
                            },
                        }
                    },
                }
            },
            {
                "toolSpec": {
                    "name": "refine_search",
                    "description": "Modify filters or search criteria on the current page. Use this when the user wants to narrow or change their search.",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {
                                "refinement": {
                                    "type": "string",
                                    "description": "What to change. Examples: 'increase max price to $2500', 'filter by 2+ bathrooms', 'sort by lowest price'",
                                },
                            },
                            "required": ["refinement"],
                        }
                    },
                }
            },
            {
                "toolSpec": {
                    "name": "navigate_back",
                    "description": "Go back to the previous page in the browser.",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {},
                        }
                    },
                }
            },
        ]

    async def _start_stream(self):
        """Initialize the Nova Sonic bidirectional stream via Bedrock."""
        self._on_status("Connecting to Nova Sonic...")

        try:
            # Start the bidirectional stream
            response = self._bedrock.invoke_model_with_response_stream(
                modelId=NOVA_SONIC_MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=json.dumps({
                    "inferenceConfiguration": {
                        "maxTokens": 1024,
                    },
                    "system": [{"text": SYSTEM_PROMPT}],
                    "toolConfig": {"tools": self._tools},
                }),
            )
            self._stream = response.get("body")
            self._is_active = True
            self._on_status("Connected — listening...")
            logger.info(f"Nova Sonic stream started for session {self.session_id}")

        except Exception as e:
            logger.error(f"Failed to start Nova Sonic stream: {e}")
            self._on_status(f"Connection error: {str(e)}")
            raise

    async def process_audio(self, audio_bytes: bytes) -> None:
        """Process incoming audio from the client microphone.

        In the full implementation, this feeds audio into the Nova Sonic
        bidirectional stream. For now, we buffer audio chunks.
        """
        if not self._is_active:
            # Auto-start session on first audio
            try:
                await self._start_stream()
            except Exception:
                return

        self._audio_buffer.extend(audio_bytes)

        # In Phase 1, we'll implement the full Strands BidiAgent integration.
        # For now, when we accumulate enough audio (~2 seconds), we process it.
        # 16kHz * 2 bytes * 2 seconds = 64000 bytes
        if len(self._audio_buffer) >= 64000:
            await self._process_buffered_audio()

    async def _process_buffered_audio(self) -> None:
        """Process buffered audio through Nova Sonic.

        This is a simplified version. The full implementation will use
        Strands BidiAgent for continuous bidirectional streaming.
        """
        audio_data = bytes(self._audio_buffer)
        self._audio_buffer.clear()

        self._on_status("Processing speech...")

        try:
            # Use Bedrock Converse API as a stepping stone before full BidiAgent
            response = self._bedrock.converse(
                modelId=NOVA_SONIC_MODEL_ID,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "audio": {
                                    "format": "pcm",
                                    "source": {"bytes": audio_data},
                                }
                            }
                        ],
                    }
                ],
                system=[{"text": SYSTEM_PROMPT}],
                toolConfig={"tools": self._tools},
                inferenceConfig={"maxTokens": 1024},
            )

            await self._handle_response(response)

        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            self._on_status("Error processing speech. Please try again.")

    async def process_text(self, text: str) -> None:
        """Process text input (fallback for when voice isn't available)."""
        self._on_transcript(text, "user")
        self._on_status("Thinking...")

        try:
            response = self._bedrock.converse(
                modelId=NOVA_SONIC_MODEL_ID,
                messages=[
                    {
                        "role": "user",
                        "content": [{"text": text}],
                    }
                ],
                system=[{"text": SYSTEM_PROMPT}],
                toolConfig={"tools": self._tools},
                inferenceConfig={"maxTokens": 1024},
            )

            await self._handle_response(response)

        except Exception as e:
            logger.error(f"Error processing text: {e}")
            self._on_transcript(f"Sorry, I encountered an error: {str(e)}", "assistant")
            self._on_status("Error — please try again")

    async def _handle_response(self, response: dict) -> None:
        """Handle Bedrock Converse response — text, audio, or tool calls."""
        output = response.get("output", {})
        message = output.get("message", {})
        content_blocks = message.get("content", [])

        for block in content_blocks:
            if "text" in block:
                text = block["text"]
                self._on_transcript(text, "assistant")

            elif "toolUse" in block:
                tool_use = block["toolUse"]
                await self._handle_tool_call(
                    tool_use["name"],
                    tool_use.get("input", {}),
                    tool_use["toolUseId"],
                )

        stop_reason = response.get("stopReason", "")
        if stop_reason == "tool_use":
            self._on_status("Executing action...")
        else:
            self._on_status("Listening...")

    async def _handle_tool_call(self, tool_name: str, tool_input: dict, tool_use_id: str) -> None:
        """Execute a tool call from Nova Sonic."""
        logger.info(f"Tool call: {tool_name}({json.dumps(tool_input)})")

        # Import tools lazily to avoid circular imports
        from tools.browse_website import browse_website
        from tools.read_page import read_page
        from tools.refine_search import refine_search
        from tools.navigate_back import navigate_back

        tool_map = {
            "browse_website": browse_website,
            "read_page": read_page,
            "refine_search": refine_search,
            "navigate_back": navigate_back,
        }

        tool_fn = tool_map.get(tool_name)
        if not tool_fn:
            self._on_transcript(f"Unknown tool: {tool_name}", "system")
            return

        self._on_status(f"Running: {tool_name}...")

        try:
            result = await tool_fn(
                session_id=self.session_id,
                on_screenshot=self._on_screenshot,
                on_status=self._on_status,
                **tool_input,
            )

            # Feed tool result back to the model for natural response
            self._on_transcript(result.get("summary", "Action completed."), "assistant")
            self._on_status("Listening...")

        except Exception as e:
            logger.error(f"Tool {tool_name} failed: {e}")
            self._on_transcript(f"I had trouble with that action: {str(e)}", "assistant")
            self._on_status("Ready")

    async def close(self) -> None:
        """Clean up the voice session."""
        self._is_active = False
        self._audio_buffer.clear()
        if self._stream:
            try:
                self._stream.close()
            except Exception:
                pass
            self._stream = None
        logger.info(f"Voice agent closed for session {self.session_id}")
