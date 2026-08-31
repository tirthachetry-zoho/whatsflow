import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverEnv } from "@/lib/env";
import { enqueueJob } from "@/lib/async";
import { rateLimit } from "@/lib/rate-limit";
import { logger, captureError } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * OpenWA Webhook Handler
 *
 * Receives message events from OpenWA and processes them through the engine.
 * Configure your OpenWA instance to send webhooks to this endpoint.
 *
 * OpenWA webhook format (message.received event):
 * {
 *   "event": "message.received",
 *   "sessionId": "...",
 *   "data": {
 *     "id": "...",
 *     "body": "Hello!",
 *     "from": "628123456789@c.us",
 *     "timestamp": 1234567890,
 *     "type": "chat",
 *     "sender": { ... }
 *   }
 * }
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = rateLimit({ key: `webhook:${ip}`, limit: 120, windowMs: 60_000 });
  if (!limited.success) {
    return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
  }

  try {
    const rawBody = await request.text();

    // Optional HMAC signature verification
    const signature = request.headers.get("x-webhook-signature");
    if (serverEnv.OPENWA_WEBHOOK_SECRET && signature) {
      const expected = crypto
        .createHmac("sha256", serverEnv.OPENWA_WEBHOOK_SECRET)
        .update(rawBody, "utf8")
        .digest("hex");
      if (signature !== expected) {
        return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parseOpenWAWebhook(payload);
    if (!parsed.messages || parsed.messages.length === 0) {
      return NextResponse.json({ ok: true });
    }

    // Resolve business from OpenWA session
    const businessId = await resolveBusinessForSession(parsed.sessionId);
    if (!businessId) {
      logger.warn("webhook: no business resolved for session", { sessionId: parsed.sessionId });
      return NextResponse.json({ ok: true });
    }

    for (const message of parsed.messages) {
      await enqueueJob("whatsapp.receive", {
        businessId,
        externalId: message.from,
        profileName: message.profileName ?? null,
        text: message.text ?? null,
        mediaType: message.mediaType ?? null,
        mediaUrl: message.mediaUrl ?? null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureError(error, { route: "POST /api/webhooks/openwa" });
    return NextResponse.json({ ok: true });
  }
}

interface ParsedWebhookMessage {
  from: string;
  profileName?: string;
  text?: string;
  mediaType?: string;
  mediaUrl?: string;
}

function parseOpenWAWebhook(payload: unknown): { messages: ParsedWebhookMessage[]; sessionId?: string } {
  const root = payload as {
    event?: string;
    sessionId?: string;
    data?: {
      body?: string;
      from?: string;
      type?: string;
      sender?: { pushname?: string };
      hasMedia?: boolean;
      mediaUrl?: string;
    };
  };

  const messages: ParsedWebhookMessage[] = [];

  if (root.event === "message.received" && root.data) {
    const data = root.data;
    if (!data.from) return { messages: [] };

    // Skip messages from the bot itself
    if (data.from === "status@broadcast") return { messages: [] };

    messages.push({
      from: data.from.replace(/@c\.us|@g\.us/, ""),
      profileName: data.sender?.pushname ?? undefined,
      text: data.type === "chat" ? data.body : undefined,
      mediaType: data.type !== "chat" ? data.type : undefined,
      mediaUrl: data.mediaUrl ?? undefined,
    });
  }

  // Also support batch/legacy format
  if (Array.isArray((payload as { messages?: unknown[] }).messages)) {
    const batch = payload as { sessionId?: string; messages: Array<{ from?: string; body?: string; type?: string; pushname?: string }> };
    for (const msg of batch.messages) {
      if (!msg.from) continue;
      messages.push({
        from: msg.from.replace(/@c\.us|@g\.us/, ""),
        profileName: msg.pushname ?? undefined,
        text: msg.type === "chat" ? msg.body : undefined,
        mediaType: msg.type !== "chat" ? msg.type : undefined,
      });
    }
    return { messages, sessionId: batch.sessionId };
  }

  return { messages, sessionId: root.sessionId };
}

async function resolveBusinessForSession(sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) return null;

  // Check integrations for matching OpenWA session
  const integrations = await prisma.integration.findMany({
    where: { provider: "openwa", enabled: true },
    select: { businessId: true, config: true },
  });

  for (const integration of integrations) {
    const cfg = (integration.config ?? {}) as Record<string, string>;
    if (cfg.sessionId === sessionId) {
      return integration.businessId;
    }
  }

  // Single-business fallback
  if (integrations.length === 1) {
    return integrations[0]!.businessId;
  }

  return null;
}
