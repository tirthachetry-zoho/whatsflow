import { serverEnv, isAIConfigured } from "@/lib/env";
import { intentResultSchema } from "@/validators/ai";
import { logger } from "@/lib/logger";
import type { AIProvider, AIChatMessage, ClassifyIntentInput, GenerateResponseInput, SummarizeInput } from "@/services/ai/types";
import type { IntentResult } from "@/types/workflow";

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";

  isConfigured(): boolean {
    return isAIConfigured();
  }

  private baseUrl(): string {
    return serverEnv.AI_BASE_URL.replace(/\/+$/, "");
  }

  private async chat(messages: AIChatMessage[], opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
    const { json = false, temperature = 0.2 } = opts;
    const response = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: serverEnv.AI_MODEL,
        messages,
        temperature,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AI request failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI returned an empty response.");
    return content;
  }

  private parseJson(content: string): Record<string, unknown> {
    const trimmed = content.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const candidate = fenced ? fenced[1]! : trimmed;
    return JSON.parse(candidate) as Record<string, unknown>;
  }

  async classifyIntent(input: ClassifyIntentInput): Promise<IntentResult> {
    const knowledgeSnippet = input.knowledge
      .slice(0, 12)
      .map((k) => `- ${k.title}${k.content ? `: ${k.content.slice(0, 200)}` : ""}`)
      .join("\n");

    const modulesSnippet = input.modules
      ? Object.entries(input.modules).filter(([, enabled]) => enabled).map(([key]) => key).join(", ")
      : "all available";

    const historySnippet = (input.history ?? []).slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n");

    const system: AIChatMessage = {
      role: "system",
      content: [
        "You classify customer messages for a WhatsApp business assistant.",
        `Business: "${input.businessName}" (type: ${input.businessType}).`,
        `Enabled modules: ${modulesSnippet || "none"}.`,
        knowledgeSnippet ? `Business knowledge:\n${knowledgeSnippet}` : "No knowledge base configured.",
        'Respond ONLY with JSON matching this exact shape:',
        '{"intent":"<intent>","confidence":<0.0-1.0>,"entities":{...},"reason":"<short reason>"}',
        "intent must be one of: greeting, faq, product_enquiry, service_enquiry, pricing, lead, booking, order_status, payment, complaint, human_agent, unknown.",
        "Extract entities such as service, product, name, email, phone, date, time, budget, quantity when present.",
      ].join("\n"),
    };

    const user = [
      historySnippet ? `Conversation history:\n${historySnippet}\n---` : "",
      `New customer message: ${input.message}`,
    ]
      .filter(Boolean)
      .join("\n");

    const content = await this.chat([system, { role: "user", content: user }], { json: true, temperature: 0 });
    const parsed = intentResultSchema.parse(this.parseJson(content));
    logger.debug("AI classified intent", { intent: parsed.intent, confidence: parsed.confidence });
    return parsed as IntentResult;
  }

  async generateResponse(input: GenerateResponseInput): Promise<string> {
    const knowledgeSnippet = input.knowledge
      .slice(0, 10)
      .map((k) => `[${k.title}]\n${k.content.slice(0, 800)}`)
      .join("\n\n");

    const system: AIChatMessage = {
      role: "system",
      content: [
        `You are the WhatsApp assistant for "${input.businessName}".`,
        "Answer ONLY using the business knowledge provided below. Never invent prices, hours or policies.",
        "If the answer is not in the knowledge base, politely say you'll check with the team.",
        "Be concise, warm and professional. Use plain text (no markdown headers).",
        input.instructions ? `Additional instructions: ${input.instructions}` : "",
        "--- BUSINESS KNOWLEDGE ---",
        knowledgeSnippet || "(empty knowledge base)",
        "---",
      ].join("\n"),
    };

    const historySnippet = (input.history ?? []).slice(-8).map((m) => `${m.role}: ${m.content}`).join("\n");
    const fieldsSnippet = input.fields
      ? Object.entries(input.fields).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join(", ")
      : "";

    const user = [
      historySnippet ? `History:\n${historySnippet}\n---` : "",
      input.intent ? `Detected intent: ${input.intent}` : "",
      fieldsSnippet ? `Collected info: ${fieldsSnippet}` : "",
      `Customer: ${input.message}`,
    ]
      .filter(Boolean)
      .join("\n");

    return (await this.chat([system, { role: "user", content: user }], { temperature: 0.6 })).trim();
  }

  async summarizeConversation(input: SummarizeInput): Promise<string> {
    const transcript = input.messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const content = await this.chat(
      [
        { role: "system", content: "Summarize the following WhatsApp conversation for a business agent. Keep it under 120 words." },
        { role: "user", content: transcript },
      ],
      { temperature: 0.2 },
    );
    return content.trim();
  }
}
