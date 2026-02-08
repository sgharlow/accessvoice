FROM python:3.12-slim

# Install Chrome for Nova Act + build deps for pyaudio
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    gcc \
    python3-dev \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:asgi_app", "--host", "0.0.0.0", "--port", "8000"]
