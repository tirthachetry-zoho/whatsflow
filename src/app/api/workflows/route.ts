import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const businessId = url.searchParams.get("businessId");

    if (!businessId) {
      return NextResponse.json({ ok: false, error: { code: "MISSING_PARAM", message: "businessId is required" } }, { status: 400 });
    }

    const workflows = await prisma.workflow.findMany({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { executions: true } },
      },
    });

    return NextResponse.json({ ok: true, data: workflows });
  } catch (error) {
    return toErrorResponse(error, { route: "GET /api/workflows" });
  }
}
