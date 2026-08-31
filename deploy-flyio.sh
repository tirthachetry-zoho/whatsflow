#!/bin/bash
set -e

echo "🚀 Freebuff + OpenWA on Fly.io"
echo "================================"
echo ""

# Check for flyctl
if ! command -v flyctl &> /dev/null && ! command -v fly &> /dev/null; then
  echo "❌ flyctl not found. Install from: https://fly.io/docs/hands-on/install-flyctl/"
  echo "   curl -L https://fly.io/install.sh | sh"
  exit 1
fi

FLY=$(command -v flyctl 2>/dev/null || command -v fly 2>/dev/null)

# ── Step 1: Sign up / Login ──
echo "📋 Step 1: Login to Fly.io"
$FLY auth login 2>/dev/null || true
echo ""

# ── Step 2: Get free PostgreSQL from Neon ──
echo "📋 Step 2: PostgreSQL Database"
echo "   Fly.io doesn't include a free database."
echo "   Get one FREE from Neon (0.5GB free):"
echo "   → https://console.neon.tech"
echo "   → Create a project, copy the connection string"
echo ""
read -p "   Paste your DATABASE_URL (or press Enter to skip): " DB_URL
echo ""

# ── Step 3: Deploy Freebuff ──
echo "📦 Step 3: Deploying Freebuff..."
cd apps/freebuff

$FLY launch --copy-config --name freebuff --no-deploy 2>/dev/null || true

# Set secrets
AUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
WEBHOOK_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)

$FLY secrets set \
  AUTH_SECRET="$AUTH_SECRET" \
  OPENWA_WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  OPENWA_API_KEY="freebuff-admin-key" \
  OPENWA_SESSION_ID="default" \
  AI_API_KEY="" \
  --app freebuff

if [ -n "$DB_URL" ]; then
  $FLY secrets set DATABASE_URL="$DB_URL" --app freebuff
fi

echo "   ✅ Freebuff secrets configured"
echo ""

# ── Step 4: Deploy OpenWA ──
echo "📦 Step 4: Deploying OpenWA..."
cd ../openwa

$FLY launch --copy-config --name openwa --no-deploy 2>/dev/null || true

$FLY secrets set \
  API_KEY="freebuff-admin-key" \
  --app openwa

echo "   ✅ OpenWA secrets configured"
echo ""

# ── Step 5: Get URLs ──
FREEBUFF_URL=$FLY status --app freebuff 2>/dev/null | grep "hostname" | awk '{print $3}' || echo "freebuff.fly.dev"
OPENWA_URL=$FLY status --app openwa 2>/dev/null | grep "hostname" | awk '{print $3}' || echo "openwa.fly.dev"

# ── Step 6: Deploy ──
echo "📦 Step 5: Deploying..."
cd ../..
$FLY deploy --app freebuff
$FLY deploy --app openwa

echo ""
echo "================================"
echo "✅ DEPLOYED!"
echo ""
echo "  🌐 Freebuff:    https://$FREEBUFF_URL"
echo "  📱 OpenWA:      https://$OPENWA_URL"
echo ""
echo "  Set these in Freebuff's env:"
echo "    NEXT_PUBLIC_APP_URL=https://$FREEBUFF_URL"
echo "    OPENWA_BASE_URL=https://$OPENWA_URL"
echo ""
echo "  Then:"
echo "  1. Open https://$OPENWA_URL → scan QR code"
echo "  2. Open https://$FREEBUFF_URL/webhooks → set up webhook"
echo "  3. Create Integration record (see README)"
echo ""
echo "  Manage:"
echo "    $FLY status --app freebuff"
echo "    $FLY status --app openwa"
echo "    $FLY logs --app freebuff"
echo "    $FLY logs --app openwa"
