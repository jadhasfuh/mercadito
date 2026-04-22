#!/bin/bash
# Deploy Mercadito to VPS
# Usage: ./deploy.sh

set -e

VPS="root@157.173.199.130"
REMOTE_DIR="/opt/mercadito"

echo ">> Syncing files (excluding docker-compose.yml)..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='docker-compose.yml' \
  --exclude='mobile' \
  . "$VPS:$REMOTE_DIR/"

echo ">> Building and restarting container..."
ssh "$VPS" "cd $REMOTE_DIR && docker compose up -d --build"

echo ">> Done! Checking status..."
ssh "$VPS" "docker logs mercadito --tail 3"
