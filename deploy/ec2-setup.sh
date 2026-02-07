#!/bin/bash
# EC2 setup script for AccessVoice deployment
# Run on a fresh Ubuntu 22.04 / Amazon Linux 2023 instance (t3.xlarge)

set -euo pipefail

echo "=== AccessVoice EC2 Setup ==="

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt-get install -y docker-compose-plugin

# Install certbot for SSL
sudo apt-get install -y certbot

# Clone project (update with your repo URL)
# git clone https://github.com/YOUR_USER/accessvoice.git
# cd accessvoice

# Copy .env from .env.example and fill in values
# cp .env.example .env
# nano .env

# Start services
# docker compose up -d --build

# SSL setup (replace with your domain)
# sudo certbot certonly --standalone -d accessvoice.yourdomain.com

echo "=== Setup complete ==="
echo "Next steps:"
echo "1. Clone your repo"
echo "2. Copy .env.example to .env and fill in AWS credentials"
echo "3. Run: docker compose up -d --build"
echo "4. Set up SSL with certbot if using a domain"
