import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const businessId = url.searchParams.get("businessId");
    const status = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") ?? "50");

    if (!businessId) {
      return NextResponse.json({ ok: false, error: { code: "MISSING_PARAM", message: "businessId is required" } }, { status: 400 });
    }

    const where: Record<string, unknown> = { businessId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, name: true, phone: true, email: true, source: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, role: true, content: true, createdAt: true },
          },
        },
        orderBy: { lastMessageAt: "desc" },
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    return NextResponse.json({ ok: true, data: { items, total } });
  } catch (error) {
    return toErrorResponse(error, { route: "GET /api/conversations" });
  }
}
