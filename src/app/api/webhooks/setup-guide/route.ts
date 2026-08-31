import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverEnv, publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/setup-guide
 *
 * Returns a step-by-step guide for setting up the webhook,
 * including the exact URL, example payloads, and curl commands.
 */
export async function GET() {
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  const webhookUrl = `${baseUrl}/api/webhooks/openwa`;
  const hasSecret = Boolean(serverEnv.OPENWA_WEBHOOK_SECRET);

  // Check existing integrations
  const integrations = await prisma.integration.findMany({
    where: { provider: "openwa" },
    select: { id: true, businessId: true, config: true, enabled: true },
  });

  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, slug: true },
  });

  return NextResponse.json({
    ok: true,
    data: {
      webhookUrl,
      hasWebhookSecret: hasSecret,
      method: "POST",
      contentType: "application/json",

      steps: [
        {
          step: 1,
          title: "Start OpenWA",
          description: "Run your OpenWA instance. It needs to be accessible from the internet (or your local network).",
          command: "npx @open-wa/wa-automate --port 2785",
        },
        {
          step: 2,
          title: "Make Freebuff accessible",
          description: "If running locally, use ngrok or similar to expose your webhook endpoint.",
          command: hasSecret
            ? `ngrok http 3000`
            : `ngrok http 3000`,
          note: hasSecret
            ? `Your public URL will be something like https://abc123.ngrok.io`
            : `For production, set OPENWA_WEBHOOK_SECRET in .env for HMAC verification`,
        },
        {
          step: 3,
          title: "Create an Integration record",
          description: "Link your OpenWA session to a business.",
          sql: `INSERT INTO "Integration" (id, "businessId", provider, config, enabled, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  '${businesses[0]?.id ?? '<business-id>'}',
  'openwa',
  '{"sessionId": "default"}'::jsonb,
  true,
  NOW(),
  NOW()
);`,
        },
        {
          step: 4,
          title: "Configure OpenWA webhook",
          description: "In your OpenWA dashboard or config, set the webhook URL.",
          openwaConfig: {
            webhookUrl: webhookUrl,
            events: ["message.received"],
            ...(hasSecret ? { secret: serverEnv.OPENWA_WEBHOOK_SECRET } : {}),
          },
        },
        {
          step: 5,
          title: "Test with curl",
          description: "Send a test webhook payload to verify everything works.",
          curlCommand: `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    event: "message.received",
    sessionId: integrations[0] ? (JSON.parse(String(integrations[0].config)).sessionId || "default") : "default",
    data: {
      id: "test_msg_001",
      body: "Hello from OpenWA!",
      from: "628123456789@c.us",
      timestamp: Math.floor(Date.now() / 1000),
      type: "chat",
      sender: { pushname: "Test User" },
    },
  }, null, 2)}'`,
        },
        {
          step: 6,
          title: "Verify the response",
          description: "You should get { ok: true }. Check your conversations at /inbox.",
          expectedResponse: { ok: true },
        },
      ],

      payloadExamples: {
        singleMessage: {
          description: "A single incoming text message",
          payload: {
            event: "message.received",
            sessionId: "default",
            data: {
              id: "true_120363012345678901izophqBCdjWj978AEnX6tGnHXY",
              body: "Hi, I want to book an appointment",
              from: "628123456789@c.us",
              to: "628987654321@c.us",
              timestamp: 1700000000,
              type: "chat",
              sender: {
                id: "628123456789@c.us",
                pushname: "John Doe",
                phone: "628123456789",
              },
            },
          },
        },
        imageMessage: {
          description: "An incoming image message",
          payload: {
            event: "message.received",
            sessionId: "default",
            data: {
              id: "true_120363098765432109izophABCdefGHI",
              body: "",
              from: "628123456789@c.us",
              timestamp: 1700000000,
              type: "image",
              hasMedia: true,
              mediaUrl: "https://example.com/image.jpg",
              sender: {
                id: "628123456789@c.us",
                pushname: "John Doe",
              },
            },
          },
        },
        groupMessage: {
          description: "A message from a WhatsApp group",
          payload: {
            event: "message.received",
            sessionId: "default",
            data: {
              id: "true_12036305551234567890ABCDEF",
              body: "What are your opening hours?",
              from: "628123456789@g.us",
              timestamp: 1700000000,
              type: "chat",
              sender: {
                id: "628123456789@c.us",
                pushname: "Group User",
              },
            },
          },
        },
      },

      troubleshooting: [
        {
          problem: "Webhook returns 401 Invalid signature",
          solution: "Set OPENWA_WEBHOOK_SECRET in .env and make sure it matches the secret configured in OpenWA.",
        },
        {
          problem: "Webhook returns { ok: true } but no conversation appears",
          solution: "Check that an Integration record exists with provider='openwa' and config.sessionId matching your OpenWA session.",
        },
        {
          problem: "Webhook returns 404",
          solution: "Make sure the URL is correct: POST to /api/webhooks/openwa (not /api/webhooks/openwa/).",
        },
        {
          problem: "Messages are received but no reply is sent",
          solution: "Check that OpenWA is running and OPENWA_BASE_URL + OPENWA_API_KEY are set in .env.",
        },
        {
          problem: "AI responses are generic/off-topic",
          solution: "Add knowledge base entries for your business, or set AI_API_KEY for smarter responses.",
        },
      ],

      integrations: integrations.map((i) => ({
        id: i.id,
        businessId: i.businessId,
        sessionId: (JSON.parse(String(i.config)) as Record<string, string>).sessionId,
        enabled: i.enabled,
      })),

      businesses: businesses.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
      })),
    },
  });
}
