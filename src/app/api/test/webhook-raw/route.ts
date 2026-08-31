import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { processIncomingMessage } from "@/services/conversations";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/test/webhook-raw
 *
 * Accepts a raw OpenWA-format webhook payload and processes it synchronously.
 * This tests the actual webhook parsing code path without needing a real OpenWA gateway.
 *
 * Body: { sessionId: string, event: string, data: { from, body, type, sender, ... } }
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = parseTestWebhook(payload);
    if (!parsed.messages.length) {
      return NextResponse.json({ ok: true, skipped: true, reason: "No messages to process" });
    }

    // Resolve business from session ID
    const businessId = await resolveBusiness(parsed.sessionId);
    if (!businessId) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `No business resolved for session: ${parsed.sessionId}`,
        hint: "Create an Integration record with provider='openwa' and config.sessionId matching your test session.",
      });
    }

    const results = [];
    for (const msg of parsed.messages) {
      const result = await processIncomingMessage({
        businessId,
        channel: "whatsapp",
        externalId: msg.from,
        text: msg.text ?? null,
        profileName: msg.profileName ?? null,
        send: false, // Don't call OpenWA in test mode
      });
      results.push({
        conversationId: result.conversationId,
        contactId: result.contactId,
        messages: result.messages.map((m) => ({
          role: m.role,
          content: m.content,
          intent: m.intent,
        })),
        steps: result.steps,
        intent: result.intent,
        conversationStatus: result.conversationStatus,
        aiEnabled: result.aiEnabled,
        leadId: result.leadId ?? null,
        appointmentId: result.appointmentId ?? null,
        escalation: result.escalation ?? null,
      });
    }

    return NextResponse.json({ ok: true, data: results });
  } catch (error) {
    return toErrorResponse(error, { route: "POST /api/test/webhook-raw" });
  }
}

interface ParsedMsg {
  from: string;
  profileName?: string;
  text?: string;
  mediaType?: string;
  mediaUrl?: string;
}

function parseTestWebhook(payload: unknown): { messages: ParsedMsg[]; sessionId: string } {
  const root = payload as Record<string, unknown>;
  const sessionId = String(root.sessionId ?? "");

  // Standard OpenWA event format
  if (root.event === "message.received") {
    const data = root.data as Record<string, unknown> | undefined;
    if (!data?.from) return { messages: [], sessionId };
    const from = String(data.from).replace(/@c\.us|@g\.us/, "");
    if (from === "status@broadcast") return { messages: [], sessionId };
    const sender = (data.sender ?? {}) as Record<string, unknown>;
    return {
      messages: [{
        from,
        profileName: sender.pushname ? String(sender.pushname) : undefined,
        text: data.type === "chat" ? String(data.body ?? "") : undefined,
        mediaType: data.type !== "chat" ? String(data.type) : undefined,
      }],
      sessionId,
    };
  }

  // Batch format
  if (Array.isArray(root.messages)) {
    const batch = root as { sessionId: string; messages: Array<Record<string, unknown>> };
    const messages = batch.messages.map((m) => ({
      from: String(m.from ?? "").replace(/@c\.us|@g\.us/, ""),
      profileName: m.pushname ? String(m.pushname) : undefined,
      text: m.type === "chat" ? String(m.body ?? "") : undefined,
    })).filter((m) => m.from && m.from !== "status@broadcast");
    return { messages, sessionId: batch.sessionId };
  }

  return { messages: [], sessionId };
}

async function resolveBusiness(sessionId: string): Promise<string | null> {
  if (!sessionId) return null;

  const integrations = await prisma.integration.findMany({
    where: { provider: "openwa", enabled: true },
    select: { businessId: true, config: true },
  });

  // Try exact sessionId match first
  for (const integration of integrations) {
    const cfg = (integration.config ?? {}) as Record<string, string>;
    if (cfg.sessionId === sessionId) {
      return integration.businessId;
    }
  }

  // Only fall back to single-business if the sessionId is a generic/test value
  if (integrations.length === 1 && (!sessionId || sessionId.startsWith("default") || sessionId === "main")) {
    return integrations[0]!.businessId;
  }

  return null;
}
