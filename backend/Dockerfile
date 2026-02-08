FROM python:3.12-slim

# Install Chrome for Nova Act + Xvfb for virtual display + build deps for pyaudio
# Fonts and rendering libs reduce bot-detection fingerprinting
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    xvfb \
    gcc \
    python3-dev \
    portaudio19-dev \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    libgbm1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2t64 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV DISPLAY=:99

EXPOSE 8000

# Start Xvfb virtual display then uvicorn — allows Nova Act to run
# in headed mode (headless=False) which avoids bot detection on sites
# like Zillow that fingerprint headless browsers.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
