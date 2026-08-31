import { after } from "next/server";
import { captureError, logger } from "@/lib/logger";

export function runAfter(handler: () => Promise<void> | void): void {
  if (typeof after === "function") {
    try {
      after(() => {
        Promise.resolve(handler()).catch((error) => captureError(error, { origin: "runAfter" }));
      });
      return;
    } catch {
      // Not in a request scope — fall through to inline execution.
    }
  }
  Promise.resolve(handler()).catch((error) => captureError(error, { origin: "runAfter-inline" }));
}

export async function enqueueJob(name: string, payload: Record<string, unknown>): Promise<void> {
  const backend = (process.env.JOB_BACKEND ?? "inline") as string;
  if (backend !== "inline") {
    logger.warn(`enqueueJob: backend "${backend}" not yet wired — running inline for job "${name}".`);
  }
  runAfter(async () => {
    const { handleJob } = await import("@/services/jobs");
    await handleJob(name, payload);
  });
}
