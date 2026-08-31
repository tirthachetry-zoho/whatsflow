import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Replaces {{key}} placeholders with values from a vars map. */
export function renderTemplate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  });
}

export function extractVariables(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) out.add(match[1]);
  return [...out];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function generateId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "MMM d, yyyy");
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "MMM d, yyyy h:mm a");
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "h:mm a");
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? parseISO(value) : value;
  try {
    return formatDistanceToNowStrict(d, { addSuffix: true });
  } catch {
    return "";
  }
}

export function truncate(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
