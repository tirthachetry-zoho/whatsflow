import { processIncomingMessage } from "@/services/conversations";
import { runDueFollowUps } from "@/services/engine";
import { logger } from "@/lib/logger";

export async function handleJob(name: string, payload: Record<string, unknown>): Promise<void> {
  switch (name) {
    case "whatsapp.receive": {
      await processIncomingMessage({
        businessId: String(payload.businessId),
        channel: "whatsapp",
        externalId: String(payload.externalId),
        profileName: payload.profileName ? String(payload.profileName) : null,
        text: payload.text ? String(payload.text) : null,
        mediaType: payload.mediaType ? String(payload.mediaType) : null,
        mediaUrl: payload.mediaUrl ? String(payload.mediaUrl) : null,
        send: true,
      });
      break;
    }
    case "followups.run": {
      await runDueFollowUps();
      break;
    }
    default:
      logger.warn("Unknown background job", { name });
  }
}
