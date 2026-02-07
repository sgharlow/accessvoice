"""AccessVoice configuration — AWS model IDs, voice settings, server config."""

import os
from dotenv import load_dotenv

load_dotenv()

# AWS
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

# Bedrock Model IDs
NOVA_SONIC_MODEL_ID = "amazon.nova-sonic-v1:0"
NOVA_LITE_MODEL_ID = "amazon.nova-lite-v1:0"

# Nova Sonic voice config
VOICE_ID = "tiffany"  # Clear, natural female voice
INPUT_AUDIO_FORMAT = "pcm"  # 16kHz, 16-bit, mono PCM
OUTPUT_AUDIO_FORMAT = "pcm"

# Nova Act
NOVA_ACT_API_KEY = os.getenv("NOVA_ACT_API_KEY", "")

# Server
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "5173"))
CORS_ORIGINS = [
    f"http://localhost:{FRONTEND_PORT}",
    "http://localhost:5173",
    "http://localhost:3000",
]

# Session limits
MAX_CONCURRENT_SESSIONS = 3

# Screenshot streaming
SCREENSHOT_FPS = 2
SCREENSHOT_QUALITY = 60  # JPEG quality (0-100)
SCREENSHOT_WIDTH = 1280
SCREENSHOT_HEIGHT = 720

# System prompt for Nova Sonic voice agent
SYSTEM_PROMPT = """You are AccessVoice, a helpful voice assistant that helps visually impaired users browse the web through natural conversation.

Your personality:
- Warm, patient, and clear
- Concise but thorough — describe what matters, skip visual clutter
- Always acknowledge the user's request before starting a task
- Provide progress updates during long operations

When browsing:
- Summarize page content in an accessible way (headings, key info, actionable items)
- Read lists naturally: "First item... Second item..." etc.
- For search results, lead with the most relevant info (price, title, location)
- Ask clarifying questions if the request is ambiguous

Tools available:
- browse_website: Navigate to a URL and perform actions (clicking, typing, scrolling)
- read_page: Get an accessibility-focused summary of the current page
- refine_search: Apply filters or modify search criteria on the current page
- navigate_back: Go back to the previous page

Always speak filler while tools are running: "Let me look that up...", "Searching now...", etc."""
