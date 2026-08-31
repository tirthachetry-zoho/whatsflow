import { NextResponse } from "next/server";
import { runDueFollowUps } from "@/services/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const processed = await runDueFollowUps();
  return NextResponse.json({ ok: true, data: { processed } });
}
