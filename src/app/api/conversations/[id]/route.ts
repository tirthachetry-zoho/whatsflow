import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "asc" } },
        business: { select: { id: true, name: true } },
      },
    });

    if (!conversation) throw new NotFoundError("Conversation not found.");

    return NextResponse.json({ ok: true, data: conversation });
  } catch (error) {
    return toErrorResponse(error, { route: "GET /api/conversations/[id]" });
  }
}
