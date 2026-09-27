#!/usr/bin/env bash
# ==============================================================================
# SupScenario Routine Deployment & Update Script
# Updates repository, builds updated containers, and performs zero-downtime reload
# ==============================================================================

set -euo pipefail

echo "Pulling latest code changes..."
git pull origin main

echo "Rebuilding and updating containers..."
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build

echo "Pruning dangling Docker images to preserve disk space..."
docker image prune -f

echo "Service Status:"
docker compose -f docker-compose.production.yml ps
