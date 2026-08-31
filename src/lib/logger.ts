type Level = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: Level;
  message: string;
  meta?: Record<string, unknown>;
}

function write(entry: LogEntry): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: entry.level,
    message: entry.message,
    ...(entry.meta ?? {}),
  });
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write({ level: "debug", message, meta }),
  info: (message: string, meta?: Record<string, unknown>) => write({ level: "info", message, meta }),
  warn: (message: string, meta?: Record<string, unknown>) => write({ level: "warn", message, meta }),
  error: (message: string, meta?: Record<string, unknown>) => write({ level: "error", message, meta }),
};

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error(message, { ...(context ?? {}), stack });
}
