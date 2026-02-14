#!/bin/bash
# Run AccessVoice backend (no Docker required)
cd "$(dirname "$0")/backend"
pip install -r requirements.txt
uvicorn main:asgi_app --host 0.0.0.0 --port 8000
