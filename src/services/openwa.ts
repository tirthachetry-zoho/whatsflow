import { serverEnv, isOpenWAConfigured } from "@/lib/env";
import { logger, captureError } from "@/lib/logger";

/**
 * OpenWA WhatsApp Integration
 *
 * Replaces the Meta WhatsApp Cloud API with OpenWA's self-hosted REST API.
 * OpenWA is free, open-source, and supports multi-session WhatsApp gateways.
 *
 * API Reference: https://docs.open-wa.org/
 */

// ── Send Text Message ──

export interface SendTextMessageInput {
  to: string; // Phone number or chatId (e.g. "628123456789@c.us" or plain digits)
  text: string;
  sessionId?: string; // Override default session
}

export interface SendTextMessageResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult> {
  if (!isOpenWAConfigured()) {
    logger.warn("OpenWA not configured — message not sent", { to: input.to });
    return { ok: false, error: "OpenWA not configured" };
  }

  const baseUrl = serverEnv.OPENWA_BASE_URL.replace(/\/+$/, "");
  const apiKey = serverEnv.OPENWA_API_KEY!;
  const sessionId = input.sessionId || serverEnv.OPENWA_SESSION_ID || "";

  // Format the chat ID for OpenWA (needs @c.us suffix for individual chats)
  const chatId = formatChatId(input.to);

  try {
    const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        chatId,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("OpenWA send-text failed", { status: response.status, body: body.slice(0, 300) });
      return { ok: false, error: `OpenWA error (${response.status}): ${body.slice(0, 200)}` };
    }

    const data = (await response.json()) as { messageId?: string; timestamp?: number };
    logger.info("OpenWA message sent", { to: chatId, messageId: data.messageId });
    return { ok: true, messageId: data.messageId };
  } catch (error) {
    captureError(error, { module: "openwa.sendText", to: chatId });
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ── Send Media Message ──

export interface SendMediaMessageInput {
  to: string;
  mediaUrl: string;
  caption?: string;
  type?: "image" | "video" | "audio" | "document";
  sessionId?: string;
}

export async function sendMediaMessage(input: SendMediaMessageInput): Promise<SendTextMessageResult> {
  if (!isOpenWAConfigured()) {
    return { ok: false, error: "OpenWA not configured" };
  }

  const baseUrl = serverEnv.OPENWA_BASE_URL.replace(/\/+$/, "");
  const apiKey = serverEnv.OPENWA_API_KEY!;
  const sessionId = input.sessionId || serverEnv.OPENWA_SESSION_ID || "";
  const chatId = formatChatId(input.to);

  try {
    const endpoint = input.type === "video" ? "send-video"
      : input.type === "audio" ? "send-audio"
      : input.type === "document" ? "send-document"
      : "send-image";

    const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        chatId,
        file: { mimetype: `${input.type || "image"}/${input.type === "document" ? "pdf" : input.type || "jpeg"}`, url: input.mediaUrl },
        caption: input.caption || "",
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, error: `OpenWA error (${response.status})` };
    }

    const data = (await response.json()) as { messageId?: string };
    return { ok: true, messageId: data.messageId };
  } catch (error) {
    captureError(error, { module: "openwa.sendMedia", to: chatId });
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ── Session Management ──

export interface SessionInfo {
  id: string;
  name: string;
  status: string;
  engine: string;
}

export async function listSessions(): Promise<SessionInfo[]> {
  if (!isOpenWAConfigured()) return [];

  const baseUrl = serverEnv.OPENWA_BASE_URL.replace(/\/+$/, "");
  const apiKey = serverEnv.OPENWA_API_KEY!;

  try {
    const response = await fetch(`${baseUrl}/api/sessions`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { sessions?: SessionInfo[] };
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

export async function getSessionQR(sessionId: string): Promise<string | null> {
  if (!isOpenWAConfigured()) return null;

  const baseUrl = serverEnv.OPENWA_BASE_URL.replace(/\/+$/, "");
  const apiKey = serverEnv.OPENWA_API_KEY!;

  try {
    const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/qr`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { qr?: string };
    return data.qr ?? null;
  } catch {
    return null;
  }
}

// ── Resolve WhatsApp Provider Info ──

export function resolveWhatsAppProvider(): { provider: string; configured: boolean } {
  return {
    provider: "openwa",
    configured: isOpenWAConfigured(),
  };
}

// ── Helpers ──

/**
 * Formats a phone number or chat ID for OpenWA.
 * OpenWA expects chat IDs in the format "number@c.us" for individual chats.
 * If the input already contains @c.us, it's returned as-is.
 */
function formatChatId(input: string): string {
  if (input.includes("@c.us") || input.includes("@g.us")) {
    return input;
  }
  // Strip non-digits and add @c.us
  const digits = input.replace(/[^\d]/g, "");
  return `${digits}@c.us`;
}

/**
 * Extracts the phone number from an OpenWA chat ID.
 * e.g. "628123456789@c.us" → "628123456789"
 */
export function extractPhoneFromChatId(chatId: string): string {
  return chatId.replace(/@c\.us|@g\.us/, "");
}
