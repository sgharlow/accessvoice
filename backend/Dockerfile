FROM python:3.12-slim

# Build deps for pyaudio only — no Chrome/Xvfb needed (browser runs as extension)
RUN apt-get update && apt-get install -y --no-install-recommends \
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
