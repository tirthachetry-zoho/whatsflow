#!/bin/bash
set -e

echo "🚀 Freebuff + OpenWA Deployment"
echo "================================"

# Check for Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker not found. Install from https://docs.docker.com/get-docker/"
  exit 1
fi

# Copy env if needed
if [ ! -f .env ]; then
  echo "📋 Creating .env from .env.docker..."
  cp .env.docker .env
  echo "⚠️  Edit .env with your settings before continuing!"
  echo "   Key values to change:"
  echo "   - AUTH_SECRET: run 'openssl rand -base64 32'"
  echo "   - NEXT_PUBLIC_APP_URL: your public URL"
  echo "   - AI_API_KEY: for smart responses (optional)"
  exit 0
fi

# Parse command
ACTION="${1:-up}"

case "$ACTION" in
  up|start)
    echo "📦 Starting services..."
    docker compose --profile full up -d --build
    echo ""
    echo "✅ Services started!"
    echo ""
    echo "  🌐 Freebuff:    http://localhost:3000"
    echo "  📱 OpenWA:      http://localhost:2785"
    echo "  📊 Dashboard:   http://localhost:2785"
    echo "  🔌 API Docs:    http://localhost:2785/api/docs"
    echo ""
    echo "Next steps:"
    echo "  1. Open http://localhost:2785 and scan the QR code"
    echo "  2. Open http://localhost:3000/webhooks for webhook setup"
    echo "  3. Create an Integration record (see README)"
    echo ""
    echo "Run: docker compose logs -f openwa  # to watch OpenWA logs"
    ;;

  down|stop)
    echo "🛑 Stopping services..."
    docker compose --profile full down
    echo "✅ Stopped"
    ;;

  restart)
    echo "🔄 Restarting..."
    docker compose --profile full restart
    echo "✅ Restarted"
    ;;

  logs)
    docker compose logs -f ${2:-""}
    ;;

  setup)
    echo "🔧 Running database setup..."
    docker compose --profile full exec freebuff-app npx prisma migrate deploy
    docker compose --profile full exec freebuff-app npx tsx prisma/seed.ts
    echo "✅ Database seeded!"
    ;;

  status)
    docker compose --profile full ps
    ;;

  *)
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  up/start   Start all services (default)"
    echo "  down/stop  Stop all services"
    echo "  restart    Restart all services"
    echo "  logs       View logs (add service name to filter)"
    echo "  setup      Run database migrations and seed"
    echo "  status     Show service status"
    ;;
esac
