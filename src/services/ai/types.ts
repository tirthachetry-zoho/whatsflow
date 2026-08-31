import type { IntentResult } from "@/types/workflow";

export interface KnowledgeEntry {
  title: string;
  content: string;
  type?: string | null;
}

export interface ClassifyIntentInput {
  message: string;
  businessName: string;
  businessType: string;
  modules?: Record<string, boolean>;
  knowledge: KnowledgeEntry[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface GenerateResponseInput {
  message: string;
  businessName: string;
  businessType: string;
  knowledge: KnowledgeEntry[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  intent?: string | null;
  fields?: Record<string, unknown>;
  instructions?: string | null;
}

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SummarizeInput {
  businessName: string;
  messages: Array<{ role: "user" | "assistant" | "agent"; content: string }>;
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  classifyIntent(input: ClassifyIntentInput): Promise<IntentResult>;
  generateResponse(input: GenerateResponseInput): Promise<string>;
  summarizeConversation(input: SummarizeInput): Promise<string>;
}
