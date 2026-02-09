#!/bin/bash
# Start Xvfb virtual display so Nova Act can run in headed mode.
# This avoids headless browser detection on sites like Zillow.

# Clean up stale lock files from previous runs (e.g., after docker restart)
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
export DISPLAY=:99

# Wait for Xvfb to be ready
sleep 1

exec uvicorn main:asgi_app --host 0.0.0.0 --port 8000
