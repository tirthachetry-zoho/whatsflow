# Freebuff Desktop

A WhatsApp Business Workflow Platform powered by **OpenWA** — free, self-hosted, open-source WhatsApp Web API.

Build automated conversational workflows for your business: greeting bots, FAQ responders, appointment booking, lead capture, complaint escalation, and human handoff — all running on your own infrastructure with zero per-message fees.

---

## Features

- **Generic Workflow Engine** — One interpreter for every business. Behavior comes from configuration, not hardcoded logic.
- **15 Node Types** — trigger, classify_intent, ask_question, collect_field, condition, knowledge_search, generate_ai_response, create_lead, update_lead, create_booking, send_message, send_notification, human_handoff, wait, end
- **Multi-turn Conversations** — Workflows pause at question nodes and resume when the customer replies
- **Smart Entity Extraction** — Auto-fills date, time, party size, budget, and service from natural language
- **Knowledge Base Search** — FAQ answers sourced from your business's knowledge entries
- **Complaint Detection** — Automatically detects complaints and hands off to a human
- **Offline AI** — Deterministic keyword classifier works with zero credentials
- **OpenAI-Compatible** — Swap to any LLM provider via `AI_API_KEY`
- **OpenWA Integration** — Self-hosted WhatsApp gateway with REST API, session management, and webhook support

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL + Prisma |
| Styling | Tailwind CSS |
| WhatsApp | OpenWA (self-hosted) |
| AI | Deterministic (offline) + OpenAI-compatible |

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- [OpenWA](https://github.com/open-wa/wa-automate-nodejs) instance (optional — demo works without it)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL connection string:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/freebuff?schema=public"

# Optional: OpenWA gateway
OPENWA_BASE_URL="http://localhost:2785"
OPENWA_API_KEY="your-api-key"
OPENWA_SESSION_ID="default"

# Optional: OpenAI-compatible LLM
AI_API_KEY="sk-..."
AI_BASE_URL="https://api.openai.com/v1"
AI_MODEL="gpt-4o-mini"
```

### 3. Set up database

```bash
npx prisma db push
npm run db:seed
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Demo

The seed creates two demo businesses with pre-built workflows:

### 🍽️ Demo Restaurant (`demo-restaurant`)
- **Table Booking** — Multi-turn: occasion → date → time → confirmation
- **FAQ & General** — Hours, menu, pricing from knowledge base
- **Knowledge Base** — Opening hours, menu items, pricing, reservations

### 🦷 Demo Dental Clinic (`demo-dental-clinic`)
- **Appointment Booking** — Service → date → time → confirmation
- **FAQ** — Services, pricing, insurance info
- **Knowledge Base** — Teeth cleaning, whitening, implants, pricing

### Test the chat simulator

```bash
curl -X POST http://localhost:3000/api/demo/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "businessSlug": "demo-restaurant",
    "sessionId": "test-session",
    "message": "I want to book a table for 4 people tomorrow at 7pm"
  }'
```

---

## API Reference

### Chat & Simulation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/demo/simulate` | POST | Run a message through the engine without WhatsApp credentials |
| `/api/test/webhook-simulate` | POST | Simulate a WhatsApp webhook by business slug |
| `/api/test/webhook-raw` | POST | Accept raw OpenWA-format webhook payloads |

### WhatsApp Webhook

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/openwa` | POST | Receive message events from OpenWA |

**Webhook payload format:**

```json
{
  "event": "message.received",
  "sessionId": "your-session-id",
  "data": {
    "id": "msg_abc123",
    "body": "Hello!",
    "from": "628123456789@c.us",
    "type": "chat",
    "sender": { "pushname": "Customer Name" }
  }
}
```

### Conversations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations` | GET | List conversations (requires `businessId` param) |
| `/api/conversations/[id]` | GET | Get conversation detail with messages |

### Workflows & Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workflows` | GET | List workflows for a business |
| `/api/sessions` | GET | List OpenWA WhatsApp sessions |
| `/api/cron/followups` | GET | Resume wait nodes whose timer elapsed |
| `/api/docs` | GET | API documentation |

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/openwa/route.ts    # Production webhook receiver
│   │   ├── demo/simulate/route.ts      # Chat simulator
│   │   ├── test/                        # E2E test endpoints
│   │   ├── conversations/               # Conversation CRUD
│   │   ├── workflows/                   # Workflow listing
│   │   ├── sessions/                    # OpenWA session status
│   │   └── cron/followups/              # Scheduled follow-ups
│   ├── demo/page.tsx                    # Interactive demo
│   ├── workflows/page.tsx               # Workflow management
│   └── inbox/page.tsx                   # Conversation inbox
├── services/
│   ├── engine/
│   │   ├── index.ts                     # The Generic Workflow Engine
│   │   └── helpers.ts                   # Node parsing, field extraction, date utils
│   ├── ai/
│   │   ├── index.ts                     # AI facade (local + OpenAI)
│   │   ├── local.ts                     # Deterministic classifier + responder
│   │   ├── openai.ts                    # OpenAI-compatible provider
│   │   └── types.ts                     # AI type definitions
│   ├── openwa.ts                        # OpenWA REST API client
│   ├── conversations.ts                 # Message pipeline orchestrator
│   ├── contacts.ts                      # Contact management
│   ├── knowledge.ts                     # Knowledge base search
│   ├── leads.ts                         # Lead scoring & management
│   ├── appointments.ts                  # Booking & availability
│   ├── notifications.ts                 # Business member notifications
│   └── jobs.ts                          # Background job handler
├── lib/
│   ├── prisma.ts                        # Prisma client singleton
│   ├── env.ts                           # Zod-validated environment
│   ├── errors.ts                        # Error types & responses
│   ├── logger.ts                        # Structured logging
│   ├── utils.ts                         # Template rendering, helpers
│   ├── crypto.ts                        # Encryption utilities
│   ├── rate-limit.ts                    # In-memory rate limiter
│   ├── async.ts                         # after() + job queue
│   └── constants.ts                     # Default modules & config
├── types/
│   ├── workflow.ts                      # Workflow state, nodes, edges
│   └── index.ts                         # Message, conversation types
└── validators/
    └── ai.ts                            # Zod schemas for AI input
```

### How the Engine Works

1. **Message arrives** — via webhook, demo simulator, or API
2. **Contact resolution** — find or create the WhatsApp contact
3. **Conversation management** — find or create the conversation thread
4. **Escalation check** — complaints and human-agent requests always win
5. **Workflow resume** — if a workflow is waiting for an answer, resume it
6. **Intent classification** — determine what the customer wants
7. **Workflow execution** — walk through nodes, collect fields, create bookings
8. **Response delivery** — send reply via OpenWA (or return in demo mode)
9. **State persistence** — save conversation state for multi-turn flows

---

## Running E2E Tests

```bash
# Make sure PostgreSQL is running and database is set up
npx prisma db push
npm run db:seed

# Run the webhook E2E test suite
chmod +x test-webhook-e2e.sh
TEST_PORT=3000 bash test-webhook-e2e.sh
```

This runs 57 assertions across 8 sections:
- OpenWA webhook payload parsing (standard, batch, media, broadcast filter)
- Multi-turn restaurant booking (4 turns → appointment created)
- Multi-turn clinic booking (3 turns → appointment created)
- Complaint escalation / human handoff
- FAQ / knowledge base responses
- Conversations API (list + detail)
- OpenWA sessions, API docs, cron endpoint
- Error handling

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `OPENWA_BASE_URL` | No | `http://localhost:2785` | OpenWA gateway URL |
| `OPENWA_API_KEY` | No | — | OpenWA API key |
| `OPENWA_SESSION_ID` | No | — | Default OpenWA session |
| `OPENWA_WEBHOOK_SECRET` | No | — | HMAC secret for webhook verification |
| `AI_API_KEY` | No | — | OpenAI-compatible API key |
| `AI_BASE_URL` | No | `https://api.openai.com/v1` | LLM API base URL |
| `AI_MODEL` | No | `gpt-4o-mini` | LLM model name |
| `JOB_BACKEND` | No | `inline` | Job processing: `inline`, `cron`, `inngest` |

---

## Webhook Setup Guide

### Overview

Freebuff receives WhatsApp messages via a webhook endpoint. When a customer sends a message through WhatsApp, OpenWA forwards it to Freebuff, which processes it through the workflow engine and sends a reply.

```
Customer → WhatsApp → OpenWA → POST /api/webhooks/openwa → Engine → Reply → OpenWA → WhatsApp → Customer
```

### Step 1: Start OpenWA

Install and run [OpenWA](https://github.com/open-wa/wa-automate-nodejs):

```bash
npx @open-wa/wa-automate --port 2785
```

Scan the QR code with your WhatsApp to connect.

### Step 2: Configure Freebuff

Set your environment variables:

```env
# OpenWA connection (for sending replies)
OPENWA_BASE_URL="http://localhost:2785"
OPENWA_API_KEY="your-openwa-api-key"
OPENWA_SESSION_ID="default"

# Optional: HMAC webhook signature verification
OPENWA_WEBHOOK_SECRET="your-secret-here"

# Your app's public URL (used in webhook setup guide)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Step 3: Make Freebuff accessible from OpenWA

If running locally, use [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
# ngrok
ngrok http 3000
# → Gives you something like https://abc123.ngrok.io

# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000
```

### Step 4: Create an Integration record

Link your OpenWA session to a business in the database:

```sql
-- First, find your business ID
SELECT id, name, slug FROM "Business";

-- Create the integration
INSERT INTO "Integration" (id, "businessId", provider, config, enabled, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'your-business-id',   -- from the query above
  'openwa',
  '{"sessionId": "default"}'::jsonb,
  true,
  NOW(),
  NOW()
);
```

### Step 5: Configure OpenWA webhook

In your OpenWA instance, set the webhook URL to:

```
POST https://your-public-url/api/webhooks/openwa
```

For OpenWA's config (`config.js` or dashboard):

```javascript
module.exports = {
  webhook: {
    url: 'https://your-public-url/api/webhooks/openwa',
    events: ['message.received'],
    // Optional: set the same secret as OPENWA_WEBHOOK_SECRET in Freebuff
    // secret: 'your-secret-here',
  }
};
```

### Step 6: Test with curl

Send a test webhook payload to verify everything works:

```bash
curl -X POST https://your-public-url/api/webhooks/openwa \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "sessionId": "default",
    "data": {
      "id": "test_msg_001",
      "body": "Hello from OpenWA!",
      "from": "628123456789@c.us",
      "timestamp": 1700000000,
      "type": "chat",
      "sender": { "pushname": "Test User" }
    }
  }'
```

Expected response:

```json
{ "ok": true }
```

### Webhook Payload Format

The webhook accepts two formats:

**Standard OpenWA event:**
```json
{
  "event": "message.received",
  "sessionId": "default",
  "data": {
    "id": "true_120363012345678901",
    "body": "Hi, I want to book an appointment",
    "from": "628123456789@c.us",
    "timestamp": 1700000000,
    "type": "chat",
    "sender": {
      "id": "628123456789@c.us",
      "pushname": "John Doe",
      "phone": "628123456789"
    }
  }
}
```

**Batch/legacy format:**
```json
{
  "sessionId": "default",
  "messages": [
    {
      "from": "628123456789@c.us",
      "body": "Hello!",
      "type": "chat",
      "pushname": "John Doe"
    }
  ]
}
```

**Supported message types:**
| Type | Description |
|------|-------------|
| `chat` | Text message (processed as text) |
| `image` | Image (stored as media) |
| `video` | Video (stored as media) |
| `audio` | Audio (stored as media) |
| `document` | Document (stored as media) |
| `sticker` | Sticker (stored as media) |

### Webhook Security

**HMAC Signature Verification:**

Set `OPENWA_WEBHOOK_SECRET` in both Freebuff and OpenWA. Freebuff will verify the `X-Webhook-Signature` header using HMAC-SHA256.

```env
# In Freebuff .env
OPENWA_WEBHOOK_SECRET="my-shared-secret"
```

**Rate Limiting:**

The webhook endpoint is rate-limited to 120 requests per minute per IP address.

### Visual Setup Guide

Open [http://localhost:3000/webhooks](http://localhost:3000/webhooks) for an interactive setup guide with:
- Step-by-step instructions with copy-paste commands
- Live webhook test form (no OpenWA needed)
- Integration status display
- Troubleshooting tips
- Payload examples

### Troubleshooting

| Problem | Solution |
|---------|----------|
| Webhook returns `401 Invalid signature` | Set `OPENWA_WEBHOOK_SECRET` in `.env` and match it in OpenWA config |
| Webhook returns `{ ok: true }` but no conversation | Check that an `Integration` record exists with `provider='openwa'` and `config.sessionId` matching your session |
| Webhook returns `404` | URL must be `POST /api/webhooks/openwa` (no trailing slash) |
| Messages received but no reply | Check `OPENWA_BASE_URL` and `OPENWA_API_KEY` are set in `.env` |
| AI responses are generic | Add knowledge base entries for your business, or set `AI_API_KEY` for smarter responses |
| Bot responds to its own messages | Freebuff automatically filters `status@broadcast` and bot self-messages |

### Multi-Business Setup

Each OpenWA session maps to one business via the `Integration` table:

```sql
-- Restaurant webhook
INSERT INTO "Integration" (id, "businessId", provider, config, enabled, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'restaurant-id', 'openwa', '{"sessionId": "restaurant-session"}', true, NOW(), NOW());

-- Clinic webhook (different OpenWA session)
INSERT INTO "Integration" (id, "businessId", provider, config, enabled, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'clinic-id', 'openwa', '{"sessionId": "clinic-session"}', true, NOW(), NOW());
```

When a webhook arrives, Freebuff looks up the `sessionId` in the `Integration` table to find the correct business.

---

## License

MIT

---

## Deployment Options

### Option 1: Docker (Recommended — Full Stack)

Run Freebuff + OpenWA + PostgreSQL on any server with Docker.

```bash
# Clone and start
git clone https://github.com/YOUR_USER/freebuff-desktop.git
cd freebuff-desktop

# First run — creates .env
./deploy.sh

# Edit .env with your settings
nano .env

# Start everything
./deploy.sh up
```

**What you get:**
| Service | URL | Description |
|---------|-----|-------------|
| Freebuff | http://localhost:3000 | Web dashboard + API |
| OpenWA | http://localhost:2785 | WhatsApp gateway + dashboard |
| PostgreSQL | localhost:5432 | Database |

**Commands:**
```bash
./deploy.sh up        # Start all services
./deploy.sh down      # Stop all services
./deploy.sh restart   # Restart all services
./deploy.sh logs      # View logs
./deploy.sh logs openwa  # View OpenWA logs only
./deploy.sh setup     # Run migrations + seed
./deploy.sh status    # Show service status
```

**Requirements:** Docker + Docker Compose v2

---

### Option 2: Vercel (Freebuff) + Railway (OpenWA)

Best for production with zero server management.

**Freebuff on Vercel:**
1. Push to GitHub
2. Import on [vercel.com/new](https://vercel.com/new)
3. Add a PostgreSQL database (Vercel Postgres, Neon, or Supabase)
4. Set environment variables (see table above)
5. Deploy

**OpenWA on Railway:**
1. Fork [OpenWA](https://github.com/rmyndharis/OpenWA) to your GitHub
2. Import on [railway.com](https://railway.com)
3. Set:
   - `API_KEY` = your API key
   - `ENGINE_TYPE` = `whatsapp-web.js`
4. Deploy and note the public URL (e.g., `https://openwa.up.railway.app`)
5. In Freebuff's Vercel env vars, set `OPENWA_BASE_URL` to that URL
6. Configure the OpenWA webhook to point to `https://your-vercel.vercel.app/api/webhooks/openwa`

---

### Option 3: Fly.io (Everything)

Run both services on Fly.io with persistent volumes.

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch Freebuff
flyctl launch --copy-config --name freebuff
flyctl secrets set AUTH_SECRET=$(openssl rand -base64 32)
flyctl secrets set DATABASE_URL="postgresql://..."
flyctl deploy

# Launch OpenWA (separate app)
flyctl launch --copy-config --name openwa
flyctl volumes create openwa_data --region iad --size 1
flyctl deploy
```

---

### Option 4: VPS (DigitalOcean, Hetzner, etc.)

Full control, cheapest long-term.

```bash
# On your VPS (Ubuntu 22.04+)
curl -fsSL https://get.docker.com | sh
git clone https://github.com/YOUR_USER/freebuff-desktop.git
cd freebuff-desktop

# Setup
cp .env.docker .env
nano .env  # Edit settings

# Start
docker compose --profile full up -d --build
docker compose exec freebuff-app npx prisma migrate deploy
docker setup exec freebuff-app npx tsx prisma/seed.ts
```

**With Caddy reverse proxy (auto HTTPS):**
```bash
# Install Caddy
apt install -y caddy

# Add to /etc/caddy/Caddyfile:
yourdomain.com {
    reverse_proxy localhost:3000
}

openwa.yourdomain.com {
    reverse_proxy localhost:2785
}

# Restart
systemctl restart caddy
```

---

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Random string for auth (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Your public URL (e.g., `https://freebuff.vercel.app`) |
| `OPENWA_BASE_URL` | Yes | OpenWA gateway URL |
| `OPENWA_API_KEY` | Yes | OpenWA API key |
| `OPENWA_SESSION_ID` | No | Default session (default: `default`) |
| `OPENWA_WEBHOOK_SECRET` | No | HMAC secret for webhook verification |
| `AI_API_KEY` | No | OpenAI API key (empty = offline mode) |
| `AI_BASE_URL` | No | LLM API URL (default: OpenAI) |
| `AI_MODEL` | No | LLM model (default: `gpt-4o-mini`) |

