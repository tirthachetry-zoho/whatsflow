import { NextResponse } from "next/server";
import { listSessions, resolveWhatsAppProvider } from "@/services/openwa";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = resolveWhatsAppProvider();
  if (!provider.configured) {
    return NextResponse.json({
      ok: true,
      data: { provider: "openwa", configured: false, sessions: [] },
    });
  }

  const sessions = await listSessions();
  return NextResponse.json({
    ok: true,
    data: { provider: "openwa", configured: true, sessions },
  });
}
