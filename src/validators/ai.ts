import { z } from "zod";
import { INTENTS } from "@/lib/constants";

export const intentResultSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  reason: z.string().optional(),
});

export const classifyRequestSchema = z.object({
  businessId: z.string().min(1),
  message: z.string().min(1).max(5000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
});
