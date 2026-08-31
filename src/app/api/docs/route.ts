import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const docs = {
    name: "Freebuff Desktop API",
    version: "0.1.0",
    description: "WhatsApp Business Workflow Platform powered by OpenWA",
    endpoints: {
      demo: {
        "POST /api/demo/simulate": {
          description: "Run a message through the engine without WhatsApp credentials",
          body: {
            businessSlug: "demo-restaurant | demo-dental-clinic",
            sessionId: "your-session-id",
            message: "Hello, I want to book a table",
          },
        },
      },
      webhooks: {
        "POST /api/webhooks/openwa": {
          description: "Webhook receiver for OpenWA message events",
          note: "Configure your OpenWA instance to send webhooks here",
        },
      },
      conversations: {
        "GET /api/conversations": {
          description: "List conversations for a business",
          params: { businessId: "required", status: "optional filter", limit: "default 50" },
        },
        "GET /api/conversations/[id]": {
          description: "Get conversation detail with messages",
        },
      },
      workflows: {
        "GET /api/workflows": {
          description: "List workflows for a business",
          params: { businessId: "required" },
        },
      },
      sessions: {
        "GET /api/sessions": {
          description: "List OpenWA WhatsApp sessions and their status",
        },
      },
      cron: {
        "GET /api/cron/followups": {
          description: "Resume wait nodes whose timer elapsed (for cron/Inngest)",
        },
      },
    },
  };

  return NextResponse.json(docs, {
    headers: { "Content-Type": "application/json" },
  });
}
