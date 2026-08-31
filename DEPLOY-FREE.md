# 🆓 Freebuff + OpenWA — 100% Free Deployment Guide

## Cost: $0/month (no credit card needed)

| Service | Provider | Free Tier |
|---------|----------|-----------|
| **Freebuff** | Vercel | 100GB bandwidth, serverless |
| **OpenWA** | Render | 512MB RAM, sleeps after 15min idle |
| **PostgreSQL** | Neon | 0.5GB storage, always on |

---

## Step 1: Create Free PostgreSQL Database (Neon)

1. Go to **https://console.neon.tech**
2. Sign up with GitHub (free)
3. Create a new project (any name, e.g., "freebuff")
4. Copy the connection string:
   ```
   postgresql://user:password@ep-xxx-yyy.us-east-2.aws.neon.tech/freebuff?sslmode=require
   ```
5. **Save this URL** — you'll need it for Vercel

---

## Step 2: Push Code to GitHub

```bash
# Initialize git (if not already)
cd /path/to/freebuff-desktop
git init
git add -A
git commit -m "Initial commit"

# Create repo and push
gh repo create freebuff-desktop --public --push
# Or create manually on github.com and:
# git remote add origin https://github.com/YOUR_USER/freebuff-desktop.git
# git push -u origin main
```

---

## Step 3: Deploy Freebuff to Vercel

1. Go to **https://vercel.com/new**
2. Click "Import Git Repository"
3. Select your **freebuff-desktop** repo
4. Click "Deploy" (it will fail first time — that's normal)
5. Go to **Settings → Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Neon connection string from Step 1 |
| `AUTH_SECRET` | Run `openssl rand -base64 32` and paste |
| `NEXT_PUBLIC_APP_URL` | `https://freebuff.vercel.app` (your actual URL) |
| `OPENWA_BASE_URL` | `https://openwa.onrender.com` (set after Step 4) |
| `OPENWA_API_KEY` | `freebuff-admin-key` |
| `OPENWA_SESSION_ID` | `default` |

6. Go to **Deployments → Deploy** to redeploy with the env vars

**After deployment, note your URL:** `https://YOUR-APP.vercel.app`

---

## Step 4: Deploy OpenWA to Render

1. Go to **https://dashboard.render.com**
2. Sign up with GitHub (free)
3. Click **"New +"** → **"Background Worker"**
4. Connect your GitHub repo (or fork https://github.com/rmyndharis/OpenWA)
5. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `openwa` |
| **Runtime** | `Docker` |
| **Dockerfile** | `Dockerfile` |
| **Instance Type** | `Free` |

6. Add Environment Variables:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `2785` |
| `ENGINE_TYPE` | `baileys` |
| `API_KEY` | `freebuff-admin-key` |

7. Click **"Create Service"**
8. Wait for deployment (2-3 minutes)
9. **Note your URL:** `https://openwa.onrender.com`

⚠️ **Render free tier sleeps after 15 minutes of inactivity.**
The first message after idle takes ~30s to wake up. After that, it's instant.

---

## Step 5: Connect Everything

### 5a. Update Freebuff's OpenWA URL

1. Go to Vercel → your project → **Settings → Environment Variables**
2. Update `OPENWA_BASE_URL` to your Render URL:
   ```
   https://openwa.onrender.com
   ```
3. Redeploy

### 5b. Create Integration Record

Run this SQL in Neon's SQL editor (or connect with any PostgreSQL client):

```sql
-- Find your business ID
SELECT id, name, slug FROM "Business";

-- Create the OpenWA integration
INSERT INTO "Integration" (id, "businessId", provider, config, enabled, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  (SELECT id FROM "Business" WHERE slug = 'demo-restaurant'),
  'openwa',
  '{"sessionId": "default"}'::jsonb,
  true,
  NOW(),
  NOW()
);
```

### 5c. Run Database Migrations

In Neon's SQL editor, run the Prisma migrations:

```bash
# Or use Vercel's terminal: Settings → Advanced → Edit in Code Editor
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

Or add these env vars to Vercel and redeploy:
- `POSTGRES_PRISMA_URL` = your Neon URL
- `POSTGRES_URL_NON_POOLING` = your Neon URL

### 5d. Set Up OpenWA Webhook

1. Open `https://openwa.onrender.com` → Dashboard
2. Create a session (name: "default")
3. Scan the QR code with WhatsApp
4. Configure webhook:
   - URL: `https://YOUR-VERCEL-APP.vercel.app/api/webhooks/openwa`
   - Events: `message.received`
   - Secret: (leave empty for now)

---

## Step 6: Test!

1. Open `https://YOUR-VERCEL-APP.vercel.app/demo` → Chat simulator
2. Open `https://YOUR-VERCEL-APP.vercel.app/webhooks` → Webhook test form
3. Send a WhatsApp message to your connected number

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Vercel build fails | Check env vars are set, redeploy |
| Render won't start | Check logs, ensure Dockerfile path is correct |
| Messages not received | Check OpenWA webhook URL is correct |
| "Business not found" | Run the seed: `npx tsx prisma/seed.ts` |
| Render sleeps | First request takes ~30s, then it's fast |
| SSL errors | Neon requires `sslmode=require` in DATABASE_URL |

---

## Cost Summary

| Service | Monthly Cost |
|---------|-------------|
| Vercel (Freebuff) | $0 |
| Render (OpenWA) | $0 |
| Neon (PostgreSQL) | $0 |
| **Total** | **$0** |
