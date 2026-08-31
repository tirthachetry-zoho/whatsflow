import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  // OpenWA
  OPENWA_BASE_URL: z.string().default("http://localhost:2785"),
  OPENWA_API_KEY: z.string().optional(),
  OPENWA_SESSION_ID: z.string().optional(),
  OPENWA_WEBHOOK_SECRET: z.string().optional(),
  // AI (OpenAI-compatible)
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  // Jobs
  JOB_BACKEND: z.enum(["inline", "cron", "inngest", "trigger_dev"]).default("inline"),
  // Optional Redis
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
});

let cachedServer: z.infer<typeof serverSchema> | null = null;
let cachedPublic: z.infer<typeof publicSchema> | null = null;

const pick = (obj: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Record<string, string>;

function parseServer(): z.infer<typeof serverSchema> {
  const result = serverSchema.safeParse(pick(process.env as Record<string, string | undefined>));
  if (!result.success) {
    console.warn("[env] Invalid server env:", result.error.flatten().fieldErrors);
    return serverSchema.parse({});
  }
  return result.data;
}

function parsePublic(): z.infer<typeof publicSchema> {
  const result = publicSchema.safeParse(pick(process.env as Record<string, string | undefined>));
  return result.success ? result.data : publicSchema.parse({});
}

export const serverEnv: z.infer<typeof serverSchema> =
  process.env.NODE_ENV === "production"
    ? (cachedServer ??= parseServer())
    : parseServer();

export const publicEnv: z.infer<typeof publicSchema> = (cachedPublic ??= parsePublic());

export function requireDatabaseEnv(): string {
  const url = serverEnv.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure your PostgreSQL connection.");
  }
  return url;
}

export function isAIConfigured(): boolean {
  return Boolean(serverEnv.AI_API_KEY && serverEnv.AI_BASE_URL);
}

export function isOpenWAConfigured(): boolean {
  return Boolean(serverEnv.OPENWA_API_KEY && serverEnv.OPENWA_BASE_URL);
}

export const isProduction = (process.env.NODE_ENV ?? "development") === "production";
export const isDev = !isProduction;
