import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { processIncomingMessage } from "@/services/conversations";

export const dynamic = "force-dynamic";

const simulateSchema = z.object({
  businessSlug: z.string().min(1),
  sessionId: z.string().min(1).max(120),
  message: z.string().min(1).max(5000),
  profileName: z.string().max(120).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limited = rateLimit({ key: `demo:${ip}`, limit: 60, windowMs: 60_000 });
    if (!limited.success) {
      return NextResponse.json({ ok: false, error: { code: "RATE_LIMITED", message: "Too many demo requests." } }, { status: 429 });
    }

    const body = await request.json();
    const parsed = simulateSchema.safeParse(body);
    if (!parsed.success) throw parsed.error;

    const business = await prisma.business.findUnique({ where: { slug: parsed.data.businessSlug } });
    if (!business || business.status !== "active") {
      throw new NotFoundError("Demo business not found. Run `npm run db:seed` first.");
    }

    const result = await processIncomingMessage({
      businessId: business.id,
      channel: "demo",
      externalId: parsed.data.sessionId,
      text: parsed.data.message,
      profileName: parsed.data.profileName ?? "Demo Customer",
      send: false,
    });

    const transcript = await prisma.message.findMany({
      where: { conversationId: result.conversationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        conversationId: result.conversationId,
        contactId: result.contactId,
        messages: result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          intent: m.intent,
          status: m.status,
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
        })),
        transcript,
        steps: result.steps,
        conversationStatus: result.conversationStatus,
        intent: result.intent,
        aiEnabled: result.aiEnabled,
        leadId: result.leadId ?? null,
        appointmentId: result.appointmentId ?? null,
      },
    });
  } catch (error) {
    return toErrorResponse(error, { route: "POST /api/demo/simulate" });
  }
}
