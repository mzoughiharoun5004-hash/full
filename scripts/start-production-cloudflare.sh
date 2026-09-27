#!/usr/bin/env bash
# ==============================================================================
# SupScenario - Start Production Stack with Cloudflare Tunnel (Linux / Bash)
# ==============================================================================

set -euo pipefail

echo ">>> Checking .env.production..."
if [ ! -f .env.production ]; then
    cp .env.production.example .env.production
    echo "[!] Created .env.production from example. Please check your API keys."
fi

echo ">>> Building and starting Docker microservices..."
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build

echo ">>> Waiting for Cloudflare Tunnel URL..."

# A quick tunnel gets a NEW random hostname every time cloudflared starts, and
# `docker logs` keeps the output of every earlier start too. So take the LAST
# URL (the current one), and poll instead of sleeping a fixed 6 seconds so a
# freshly started tunnel has time to print it.
URL=""
for _ in {1..15}; do
    sleep 2
    URL=$(docker logs supscenario_cloudflared 2>&1 | grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' | tail -n 1 || true)
    if [ -n "$URL" ]; then
        break
    fi
done

if [ -n "$URL" ]; then
    echo "$URL"
else
    echo "Check container logs with: docker logs supscenario_cloudflared"
fi
