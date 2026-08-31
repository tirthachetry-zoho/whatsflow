import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { processIncomingMessage } from "@/services/conversations";

export const dynamic = "force-dynamic";

/**
 * POST /api/test/webhook-simulate
 *
 * Simulates an OpenWA webhook delivery, processing it synchronously
 * so we can test the full pipeline: webhook → engine → reply.
 *
 * Body:
 *   { businessSlug: string, phone: string, message: string, profileName?: string, sessionId?: string }
 */
const schema = z.object({
  businessSlug: z.string().min(1),
  phone: z.string().min(1),
  message: z.string().min(1).max(5000),
  profileName: z.string().max(120).optional().nullable(),
  sessionId: z.string().max(120).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return toErrorResponse(parsed.error);

    const business = await prisma.business.findUnique({
      where: { slug: parsed.data.businessSlug },
    });
    if (!business || business.status !== "active") {
      return toErrorResponse(new Error("Business not found or inactive."), { route: "POST /api/test/webhook-simulate" });
    }

    // Run through the full pipeline: contact → conversation → engine → reply
    const result = await processIncomingMessage({
      businessId: business.id,
      channel: "whatsapp",
      externalId: parsed.data.phone,
      text: parsed.data.message,
      profileName: parsed.data.profileName ?? "Test User",
      send: false, // Don't actually call OpenWA
    });

    // Fetch full message history for the conversation
    const transcript = await prisma.message.findMany({
      where: { conversationId: result.conversationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, intent: true, status: true, createdAt: true },
    });

    // Fetch conversation state
    const conversation = await prisma.conversation.findUnique({
      where: { id: result.conversationId },
      select: { id: true, status: true, aiEnabled: true, intent: true, channel: true, lastMessageAt: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        conversationId: result.conversationId,
        contactId: result.contactId,
        conversation,
        messages: result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          intent: m.intent,
          status: m.status,
        })),
        transcript,
        steps: result.steps,
        conversationStatus: result.conversationStatus,
        intent: result.intent,
        aiEnabled: result.aiEnabled,
        leadId: result.leadId ?? null,
        appointmentId: result.appointmentId ?? null,
        escalation: result.escalation ?? null,
      },
    });
  } catch (error) {
    return toErrorResponse(error, { route: "POST /api/test/webhook-simulate" });
  }
}
