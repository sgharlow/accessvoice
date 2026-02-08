FROM python:3.12-slim

# Install Chrome for Nova Act + Xvfb for virtual display + build deps for pyaudio
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    xvfb \
    gcc \
    python3-dev \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Start Xvfb virtual display then uvicorn — allows Nova Act to run
# in headed mode (headless=False) which avoids bot detection on sites
# like Zillow that fingerprint headless browsers.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
