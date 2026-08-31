import { isAIConfigured, serverEnv } from "@/lib/env";
import { logger, captureError } from "@/lib/logger";
import { intentResultSchema } from "@/validators/ai";
import { OpenAICompatibleProvider } from "@/services/ai/openai";
import { getLocalProvider } from "@/services/ai/local";
import type { AIProvider, ClassifyIntentInput, GenerateResponseInput, SummarizeInput } from "@/services/ai/types";
import type { IntentResult } from "@/types/workflow";

let providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!providerInstance) {
    const configured = isAIConfigured();
    logger.info(`AI provider selected: ${configured ? `openai-compatible (${serverEnv.AI_BASE_URL})` : "local-deterministic (offline mode)"}`);
    providerInstance = configured ? new OpenAICompatibleProvider() : getLocalProvider();
  }
  return providerInstance;
}

export async function classifyIntent(input: ClassifyIntentInput): Promise<IntentResult> {
  const provider = getAIProvider();
  if (provider.name !== "local-deterministic") {
    try {
      const result = await provider.classifyIntent(input);
      const validated = intentResultSchema.safeParse(result);
      if (validated.success) return validated.data;
      logger.warn("AI intent output failed validation, using fallback:", { result });
    } catch (error) {
      captureError(error, { module: "ai.classifyIntent" });
    }
    return getLocalProvider().classifyIntent(input);
  }
  return provider.classifyIntent(input);
}

export async function generateResponse(input: GenerateResponseInput): Promise<string> {
  const provider = getAIProvider();
  if (provider.name !== "local-deterministic") {
    try {
      return await provider.generateResponse(input);
    } catch (error) {
      captureError(error, { module: "ai.generateResponse" });
    }
    return getLocalProvider().generateResponse(input);
  }
  return provider.generateResponse(input);
}

export async function summarizeConversation(input: SummarizeInput): Promise<string> {
  const provider = getAIProvider();
  if (provider.name !== "local-deterministic") {
    try {
      return await provider.summarizeConversation(input);
    } catch (error) {
      captureError(error, { module: "ai.summarizeConversation" });
    }
  }
  return getLocalProvider().summarizeConversation(input);
}
