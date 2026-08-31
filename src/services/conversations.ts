import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MODULES } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { handleMessage } from "@/services/engine";
import { getOrCreateContact } from "@/services/contacts";
import { sendTextMessage, resolveWhatsAppProvider } from "@/services/openwa";
import { logger } from "@/lib/logger";
import type { MessageItem } from "@/types";

export interface ProcessIncomingMessageOptions {
  businessId: string;
  channel: "whatsapp" | "demo" | "web";
  externalId: string;
  profileName?: string | null;
  text?: string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  send?: boolean;
}

export interface ProcessIncomingMessageResult {
  conversationId: string;
  contactId: string;
  messages: MessageItem[];
  steps: Awaited<ReturnType<typeof handleMessage>>["steps"];
  conversationStatus: string;
  intent: string | null;
  aiEnabled: boolean;
  leadId?: string | null;
  appointmentId?: string | null;
  escalation?: "handoff" | null;
}

/**
 * The canonical message pipeline:
 * business → contact → conversation → state → intent → workflow →
 * response → send (via OpenWA) → save → update state.
 */
export async function processIncomingMessage(
  opts: ProcessIncomingMessageOptions,
): Promise<ProcessIncomingMessageResult> {
  // 1. Find business (active)
  const business = await prisma.business.findUnique({
    where: { id: opts.businessId },
    include: { settings: true },
  });
  if (!business || business.status !== "active") {
    throw new NotFoundError("Business not found or inactive.");
  }

  // 2. Find / create contact
  const contact = await getOrCreateContact({
    businessId: business.id,
    phone: opts.externalId,
    name: opts.profileName ?? undefined,
    source: opts.channel,
  });

  // 3. Find / create conversation
  let conversation = await prisma.conversation.findFirst({
    where: { businessId: business.id, contactId: contact.id, channel: opts.channel },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        businessId: business.id,
        contactId: contact.id,
        channel: opts.channel,
        status: "NEW",
      },
    });
  }

  // 4. Persist the incoming message
  const content = opts.text?.trim() || (opts.mediaType ? `[${opts.mediaType}]` : "");
  await prisma.message.create({
    data: {
      businessId: business.id,
      conversationId: conversation.id,
      role: "user",
      content,
      mediaType: opts.mediaType ?? null,
      mediaUrl: opts.mediaUrl ?? null,
      status: "received",
    },
  });

  const modules = (business.settings?.modules as Record<string, boolean>) ?? DEFAULT_MODULES;

  // 5-7. Run the generic engine
  let result: Awaited<ReturnType<typeof handleMessage>>;
  if (conversation.aiEnabled) {
    result = await handleMessage({
      business: business as never,
      contact,
      conversation: {
        id: conversation.id,
        businessId: conversation.businessId,
        contactId: conversation.contactId,
        channel: conversation.channel,
        status: conversation.status,
        aiEnabled: conversation.aiEnabled,
        workflowState: conversation.workflowState,
      },
      text: content,
      modules,
    });
  } else {
    result = {
      messages: [],
      steps: [],
      newStatus: conversation.status,
      intent: null,
      workflowState: conversation.workflowState as never,
    };
  }

  // 8. Persist assistant messages
  const savedMessages: MessageItem[] = [];
  for (const out of result.messages) {
    const record = await prisma.message.create({
      data: {
        businessId: business.id,
        conversationId: conversation.id,
        role: "assistant",
        content: out.text,
        status: "sent",
        intent: result.intent ?? undefined,
        metadata: out.templateId ? { templateId: out.templateId } : undefined,
      },
    });
    savedMessages.push(serializeMessage(record));
  }

  // 9. Update conversation state
  const nextAiEnabled = result.escalation === "handoff" ? false : conversation.aiEnabled;
  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: nextAiEnabled ? result.newStatus : conversation.status,
      aiEnabled: nextAiEnabled,
      intent: result.intent ?? conversation.intent,
      currentWorkflowId: (result.workflowState as { workflowId?: string } | null)?.workflowId ?? null,
      workflowState: result.workflowState ? (result.workflowState as object) : Prisma.JsonNull,
      lastMessageAt: new Date(),
    },
  });

  // 10. Deliver via OpenWA (when channel is whatsapp + send flag)
  if (opts.channel === "whatsapp" && opts.send !== false && result.messages.length > 0) {
    const to = opts.externalId;
    for (const out of result.messages) {
      const delivered = await sendTextMessage({ to, text: out.text });
      if (!delivered.ok) {
        logger.warn("OpenWA delivery failed", { businessId: business.id, error: delivered.error });
      }
    }
  }

  return {
    conversationId: conversation.id,
    contactId: contact.id,
    messages: savedMessages,
    steps: result.steps,
    conversationStatus: updated.status,
    intent: updated.intent,
    aiEnabled: updated.aiEnabled,
    leadId: (result as { leadId?: string }).leadId ?? null,
    appointmentId: (result as { appointmentId?: string }).appointmentId ?? null,
    escalation: result.escalation ?? null,
  };
}

function serializeMessage(message: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  intent: string | null;
  status: string;
  error: string | null;
  metadata: unknown;
  createdAt: Date;
}): MessageItem {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType,
    intent: message.intent,
    status: message.status,
    error: message.error,
    metadata: message.metadata as Record<string, unknown> | null,
    createdAt: message.createdAt,
  };
}

export { resolveWhatsAppProvider };
