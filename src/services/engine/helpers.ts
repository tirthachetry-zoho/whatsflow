import type { Business, BusinessSettings, Contact, Conversation } from "@prisma/client";
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode, WorkflowStepLog, OutboundMessage } from "@/types/workflow";

export interface EngineBusiness extends Business {
  settings: BusinessSettings | null;
}

export interface EngineContextBase {
  business: EngineBusiness;
  contact: Contact;
  conversation: Conversation;
  settings: BusinessSettings | null;
  modules: Record<string, boolean>;
  text: string;
  context: Record<string, unknown>;
  messages: OutboundMessage[];
  steps: WorkflowStepLog[];
  knowledge: Array<{ type: string | null; title: string; content: string }>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export function parseDefinition(value: unknown): WorkflowDefinition {
  if (Array.isArray(value)) {
    return { version: 1, nodes: value as WorkflowNode[], edges: [] };
  }
  const def = (value ?? {}) as Partial<WorkflowDefinition>;
  return {
    version: 1,
    nodes: Array.isArray(def.nodes) ? def.nodes : [],
    edges: Array.isArray(def.edges) ? def.edges : [],
  };
}

export function findNode(def: WorkflowDefinition, id: string | null | undefined): WorkflowNode | null {
  if (!id) return null;
  return def.nodes.find((n) => n.id === id) ?? null;
}

export function findEntryNode(def: WorkflowDefinition): WorkflowNode | null {
  return def.nodes.find((n) => n.type === "trigger") ?? def.nodes[0] ?? null;
}

export function outgoingEdges(def: WorkflowDefinition, nodeId: string): WorkflowEdge[] {
  return def.edges.filter((e) => e.source === nodeId);
}

export function getNextNodeId(def: WorkflowDefinition, nodeId: string): string | null {
  const edge = outgoingEdges(def, nodeId)[0];
  return edge?.target ?? null;
}

export function getBranchNodeId(def: WorkflowDefinition, nodeId: string, outcome: boolean): string | null {
  const edges = outgoingEdges(def, nodeId);
  const preferred = edges.find((e) => e.label === (outcome ? "true" : "false"));
  if (preferred) return preferred.target;
  if (outcome) return edges[0]?.target ?? null;
  return edges[1]?.target ?? null;
}

export function getPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function getValueForField(ctx: EngineContextBase, fieldKey: string): unknown {
  const fields = (ctx.context.fields ?? {}) as Record<string, unknown>;
  const entities = (ctx.context.entities ?? {}) as Record<string, unknown>;
  if (fields[fieldKey] !== undefined) return fields[fieldKey];
  if (entities[fieldKey] !== undefined) return entities[fieldKey];
  if (fieldKey === "name") return ctx.contact.name;
  if (fieldKey === "phone") return ctx.contact.phone;
  return undefined;
}

export function flattenContextVars(ctx: EngineContextBase): Record<string, unknown> {
  const c = ctx.context ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(c)) {
    if (key !== "fields" && key !== "entities") out[key] = value;
  }
  const entities = (c.entities ?? {}) as Record<string, unknown>;
  const fields = (c.fields ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(entities)) {
    if (value !== undefined) {
      out[key] = value;
      out[`entities.${key}`] = value;
      if (out[`fields.${key}`] === undefined) out[`fields.${key}`] = value;
    }
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      out[key] = value;
      out[`fields.${key}`] = value;
    }
  }
  out.businessName = ctx.business.name;
  out.contactName = String(ctx.contact.name ?? entities.name ?? "");
  out.message = ctx.text;
  const hits = Array.isArray(c.knowledgeHits) ? (c.knowledgeHits as Array<{ title: string; content: string }>) : [];
  if (hits[0]) {
    out.knowledgeHit = hits[0].content;
    out.knowledgeTitle = hits[0].title;
  }
  return out;
}

export function isQuestionNode(node: WorkflowNode): boolean {
  return node.type === "collect_field" || node.type === "ask_question";
}

const STATUS_BY_INTENT: Record<string, string> = {
  greeting: "GREETING",
  faq: "FAQ",
  product_enquiry: "FAQ",
  service_enquiry: "FAQ",
  pricing: "FAQ",
  lead: "LEAD_CAPTURE",
  booking: "BOOKING",
  order_status: "ORDER_ENQUIRY",
  payment: "PAYMENT",
  complaint: "HUMAN_HANDOFF",
  human_agent: "HUMAN_HANDOFF",
  unknown: "IDENTIFYING_INTENT",
};

export function statusForIntent(intent: string | null | undefined): string {
  if (!intent) return "IDENTIFYING_INTENT";
  return STATUS_BY_INTENT[intent] ?? "IDENTIFYING_INTENT";
}

let stepCounter = 0;

export function makeStep(
  type: WorkflowStepLog["type"],
  label: string,
  detail: string | undefined,
  nodeId?: string,
): WorkflowStepLog {
  stepCounter += 1;
  return { id: `s_${Date.now().toString(36)}_${stepCounter}`, type, label, detail, status: "completed", nodeId };
}

export function parseFlexibleDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return new Date(value);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const lower = text.toLowerCase();
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (/\bday after tomorrow\b/.test(lower)) return addDays(now, 2);
  if (/\btomorrow\b/.test(lower)) return addDays(now, 1);
  if (/\b(today|tonight)\b/.test(lower)) return now;
  if (/\bnext week\b/.test(lower)) return addDays(now, 7);
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  for (const [name, offset] of Object.entries(dayMap)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) {
      let delta = (offset - now.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays(now, delta);
    }
  }
  return null;
}

export function parseFlexibleTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return formatHHMM(value);
  const text = String(value).trim().toLowerCase();
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let h = parseInt(ampm[1]!, 10);
    const m = ampm[2] ? parseInt(ampm[2]!, 10) : 0;
    if (ampm[3] === "pm" && h < 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const military = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (military) return `${String(parseInt(military[1]!, 10)).padStart(2, "0")}:${military[2]}`;
  if (text === "noon") return "12:00";
  if (text === "midnight") return "00:00";
  return null;
}

export function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function combineDateAndTime(date: Date, time: string): Date {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
