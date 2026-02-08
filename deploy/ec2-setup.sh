#!/bin/bash
# EC2 setup script for AccessVoice deployment
# Run on a fresh Ubuntu 22.04 / Amazon Linux 2023 instance (t3.xlarge recommended)
# Usage: curl -sL <raw-url> | bash   OR   bash ec2-setup.sh

set -euo pipefail

REPO_URL="https://github.com/sgharlow/accessvoice.git"
APP_DIR="$HOME/accessvoice"

echo "=== AccessVoice EC2 Setup ==="

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. You may need to log out and back in for group changes."
fi

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Install certbot for SSL (optional)
sudo apt-get install -y certbot

# Clone project
if [ -d "$APP_DIR" ]; then
    echo "Directory $APP_DIR already exists — pulling latest..."
    cd "$APP_DIR" && git pull
else
    echo "Cloning $REPO_URL..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# Set up environment
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo ""
    echo "=== IMPORTANT ==="
    echo "Edit $APP_DIR/.env and fill in your AWS credentials:"
    echo "  nano $APP_DIR/.env"
    echo ""
    echo "Required variables:"
    echo "  AWS_ACCESS_KEY_ID"
    echo "  AWS_SECRET_ACCESS_KEY"
    echo "  NOVA_ACT_API_KEY"
    echo ""
    read -rp "Press Enter after editing .env to continue (or Ctrl+C to exit)..."
fi

# Open firewall (port 80 for HTTP)
if command -v ufw &> /dev/null; then
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 22/tcp
    echo "Firewall rules updated (ports 22, 80, 443)"
fi

# Build and start services
echo "Building and starting AccessVoice..."
cd "$APP_DIR"
sudo docker compose -f docker-compose.prod.yml up -d --build

# Wait for backend to be ready
echo "Waiting for backend to start..."
for i in $(seq 1 30); do
    if curl -sf http://localhost/health > /dev/null 2>&1; then
        echo "Health check passed!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "WARNING: Health check not responding after 30s. Check logs:"
        echo "  sudo docker compose -f docker-compose.prod.yml logs"
        exit 1
    fi
    sleep 1
done

echo ""
echo "=== Setup complete ==="
echo "AccessVoice is running at: http://$(curl -s ifconfig.me)"
echo ""
echo "Useful commands:"
echo "  Logs:    sudo docker compose -f docker-compose.prod.yml logs -f"
echo "  Restart: sudo docker compose -f docker-compose.prod.yml restart"
echo "  Stop:    sudo docker compose -f docker-compose.prod.yml down"
echo ""
echo "Optional: Set up SSL with certbot for HTTPS:"
echo "  sudo certbot certonly --standalone -d yourdomain.com"
echo "  Then uncomment the SSL block in deploy/nginx.conf"
