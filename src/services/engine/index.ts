import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyIntent, generateResponse } from "@/services/ai";
import { searchKnowledge, localClassifyIntent, FIELD_ENTITY_ALIASES } from "@/services/ai/local";
import { loadBusinessKnowledge } from "@/services/knowledge";
import { createLead, updateLead, scoreLead } from "@/services/leads";
import { createAppointment, checkAvailability } from "@/services/appointments";
import { notifyBusinessMembers } from "@/services/notifications";
import { DEFAULT_MODULES } from "@/lib/constants";
import { renderTemplate } from "@/lib/utils";
import { logger, captureError } from "@/lib/logger";
import type { EngineContextBase, EngineBusiness } from "@/services/engine/helpers";
import {
  parseDefinition, findNode, findEntryNode, getNextNodeId, getBranchNodeId,
  getValueForField, flattenContextVars, isQuestionNode, statusForIntent, makeStep,
  parseFlexibleDate, parseFlexibleTime, combineDateAndTime,
} from "@/services/engine/helpers";
import type { OutboundMessage, WorkflowDefinition, WorkflowNode, WorkflowState, WorkflowStepLog } from "@/types/workflow";

export interface HandleMessageInput {
  business: EngineBusiness;
  contact: { id: string; name: string | null; phone: string | null };
  conversation: ConversationLite;
  text: string;
  modules: Record<string, boolean>;
}

export interface ConversationLite {
  id: string;
  businessId: string;
  contactId: string;
  channel: string;
  status: string;
  aiEnabled: boolean;
  workflowState: unknown;
}

export interface HandleResult {
  messages: OutboundMessage[];
  steps: WorkflowStepLog[];
  newStatus: string;
  intent: string | null;
  workflowState: WorkflowState | null | Record<string, unknown>;
  leadId?: string | null;
  appointmentId?: string | null;
  escalation?: "handoff" | null;
}

interface RunContext extends Omit<EngineContextBase, "business"> {
  business: HandleMessageInput["business"] & { settings: { [k: string]: unknown } | null; name: string; businessType: string };
  executionId?: string;
  workflowState: WorkflowState | null;
}

/**
 * THE GENERIC WORKFLOW ENGINE
 *
 * One interpreter for every business. All behaviour comes from:
 * • the business module configuration,
 * • the matched workflow definition (nodes + edges),
 * • the business knowledge base.
 *
 * There is NO `businessType === "..."` branching anywhere in this file.
 */
export async function handleMessage(input: HandleMessageInput): Promise<HandleResult> {
  const modules = input.modules ?? DEFAULT_MODULES;
  const settings = (input.business as { settings?: { aiConfig?: unknown; greetingMessage?: string | null } | null }).settings ?? null;
  const aiConfig = (settings?.aiConfig ?? {}) as { threshold?: number; instructions?: string };
  const threshold = aiConfig.threshold ?? 0.6;
  const knowledge = await loadBusinessKnowledge(input.business.id);
  const kbEntries = knowledge.map((k) => ({ type: k.type, title: k.title, content: k.content }));
  const history = await loadRecentMessages(input.conversation.id);

  const ctx: RunContext = {
    business: input.business as never,
    contact: input.contact as never,
    conversation: input.conversation as never,
    settings: settings as never,
    modules,
    text: input.text,
    context: { message: input.text },
    messages: [],
    steps: [],
    knowledge: kbEntries,
    history,
    workflowState: null,
  };

  const result: HandleResult = {
    messages: ctx.messages,
    steps: ctx.steps,
    newStatus: input.conversation.status,
    intent: null,
    workflowState: null,
  };

  // 0. Escalation — complaints & human-agent requests always win.
  const escalationReason = await detectEscalation(input.text, modules);
  if (escalationReason) {
    return await performHandoff(ctx, escalationReason, result);
  }

  // 1. Resume an in-progress workflow that is waiting for an answer.
  const state = (input.conversation.workflowState ?? null) as WorkflowState | null;
  if (state?.workflowId && state.executionId) {
    const wf = await prisma.workflow.findUnique({ where: { id: state.workflowId } });
    if (wf?.active && wf.businessId === input.business.id) {
      const def = parseDefinition(wf.definition);
      const pausedNode = state.waitingForNodeId ? findNode(def, state.waitingForNodeId) : null;
      if (pausedNode && isQuestionNode(pausedNode)) {
        ctx.executionId = state.executionId;
        ctx.workflowState = { ...state };
        ctx.context = (state.context ?? {}) as Record<string, unknown>;
        const fieldKey = String(pausedNode.params.field ?? "");
        if (fieldKey) {
          const trimmed = input.text.trim().toLowerCase();
          const dismissed = ["skip", "n/a", "na", "none", "none.", "not now", "dont have", "no thanks"].includes(trimmed);
          if (dismissed) {
            setNested(ctx.context, `fields.${fieldKey}`, null);
          } else {
            const answer = await parseAnswerValue(ctx, fieldKey, input.text);
            setNested(ctx.context, `fields.${fieldKey}`, answer);
          }
        }
        const label = String(pausedNode.params.label ?? fieldKey ?? "question");
        ctx.steps.push(makeStep(pausedNode.type as never, `Collected ${label}`, input.text, pausedNode.id));
        const nextNodeId = getNextNodeId(def, pausedNode.id);
        ctx.workflowState = { ...ctx.workflowState, waitingForNodeId: null, currentNodeId: pausedNode.id };
        await runFrom(ctx, wf.id, def, nextNodeId);
        return finalize(ctx, result);
      }
    }
  }

  // 2. Fresh turn — classify the intent.
  let intentResult;
  try {
    intentResult = await classifyIntent({
      message: input.text,
      businessName: input.business.name,
      businessType: (input.business as { businessType?: string }).businessType ?? "other",
      modules,
      knowledge: kbEntries,
      history,
    });
  } catch (error) {
    captureError(error, { module: "engine.classify" });
    intentResult = { intent: "unknown", confidence: 0.2, entities: {} };
  }

  result.intent = intentResult.intent;
  ctx.context = {
    message: input.text,
    intent: intentResult.intent,
    entities: { ...(intentResult.entities ?? {}) },
    fields: {},
  };
  ctx.steps.push(makeStep("intent_classified", "Intent", `${intentResult.intent} (${Math.round(intentResult.confidence * 100)}%)`));

  // 3. Greeting fast path.
  if (intentResult.intent === "greeting") {
    const greeting = settings?.greetingMessage
      ? renderTemplate(settings.greetingMessage, { businessName: input.business.name })
      : `Hello! 👋 Welcome to ${input.business.name}. How can I help you today?`;
    pushMessage(ctx, greeting);
    result.newStatus = "GREETING";
    return result;
  }

  // 4. Low confidence → clarify once, then hand off.
  if (intentResult.confidence < threshold) {
    const priorClarify = Number((state?.context?.clarifyCount as number | undefined) ?? 0);
    if (priorClarify >= 1) {
      return await performHandoff(ctx, "AI confidence remained below threshold after clarification.", result);
    }
    result.intent = intentResult.intent;
    result.workflowState = {
      clarifyCount: priorClarify + 1,
      context: { message: input.text, clarifyCount: priorClarify + 1 },
    };
    pushMessage(ctx, "I want to make sure I help you correctly — could you tell me a bit more about what you need?");
    result.newStatus = "IDENTIFYING_INTENT";
    return result;
  }

  // 5. Find this business's workflow for the intent.
  const workflow = await findWorkflowForIntent(input.business.id, intentResult.intent);
  if (!workflow) {
    const relevant = searchKnowledge(kbEntries, input.text);
    const answer = await generateResponse({
      message: input.text,
      businessName: input.business.name,
      businessType: (input.business as { businessType?: string }).businessType ?? "other",
      knowledge: relevant.length > 0 ? relevant : kbEntries,
      history,
      intent: intentResult.intent,
      fields: (intentResult.entities ?? {}) as Record<string, unknown>,
      instructions: (aiConfig.instructions as string | undefined) ?? null,
    });
    pushMessage(ctx, answer || "Thanks for your message!");
    result.newStatus = statusForIntent(intentResult.intent);
    return result;
  }

  // 6. Start a fresh execution.
  const def = parseDefinition(workflow.definition);
  const entry = findEntryNode(def);
  const execution = await prisma.workflowExecution.create({
    data: {
      businessId: input.business.id,
      workflowId: workflow.id,
      conversationId: input.conversation.id,
      contactId: input.contact.id,
      trigger: "message_received",
      status: "RUNNING",
      context: { intent: intentResult.intent, entities: { ...(intentResult.entities ?? {}) } },
    },
  });
  ctx.executionId = execution.id;
  ctx.workflowState = {
    workflowId: workflow.id,
    currentNodeId: entry?.id ?? null,
    executionId: execution.id,
    context: ctx.context,
    waitingForNodeId: null,
  };
  ctx.steps.push(makeStep("trigger", "Workflow Started", workflow.name));
  await runFrom(ctx, workflow.id, def, entry?.id ?? null);
  return finalize(ctx, result);
}

async function runFrom(ctx: RunContext, workflowId: string, def: WorkflowDefinition, startNodeId: string | null): Promise<void> {
  let nodeId = startNodeId;
  let guard = 0;
  while (nodeId && guard++ < 40) {
    const node = findNode(def, nodeId);
    if (!node) break;
    const vars = flattenContextVars(ctx);

    switch (node.type) {
      case "trigger": {
        ctx.steps.push(makeStep("trigger", "Trigger", String(node.params.trigger ?? "message_received"), node.id));
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "classify_intent": {
        if (!ctx.context.intent) {
          try {
            const res = await classifyIntent({
              message: ctx.text,
              businessName: ctx.business.name,
              businessType: String(ctx.business.businessType ?? "other"),
              modules: ctx.modules,
              knowledge: ctx.knowledge,
              history: ctx.history,
            });
            ctx.context.intent = res.intent;
            ctx.context.entities = { ...((ctx.context.entities ?? {}) as object), ...(res.entities ?? {}) };
          } catch (error) {
            captureError(error, { module: "engine.classifyNode" });
            ctx.context.intent = "unknown";
          }
        }
        ctx.steps.push(makeStep("intent_classified", "AI Intent", `intent: ${String(ctx.context.intent)}`, node.id));
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "knowledge_search": {
        const query = renderTemplate(String(node.params.query ?? "{{intent}} {{message}}"), vars);
        const hits = searchKnowledge(ctx.knowledge, query || ctx.text);
        ctx.context.knowledgeHits = hits.map((h) => ({ title: h.title, content: h.content, type: h.type }));
        ctx.steps.push(makeStep("knowledge_search", "Knowledge Search", `${hits.length} match(es)`, node.id));
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "generate_ai_response": {
        const hits = Array.isArray(ctx.context.knowledgeHits)
          ? (ctx.context.knowledgeHits as Array<{ title: string; content: string; type: string | null }>)
          : [];
        try {
          const answer = await generateResponse({
            message: ctx.text,
            businessName: ctx.business.name,
            businessType: String(ctx.business.businessType ?? "other"),
            knowledge: hits.length > 0 ? hits.map((h) => ({ title: h.title, content: h.content, type: h.type })) : ctx.knowledge,
            history: ctx.history,
            intent: String(ctx.context.intent ?? ""),
            fields: (ctx.context.fields ?? {}) as Record<string, unknown>,
            instructions: (node.params.instructions as string | undefined) ?? null,
          });
          ctx.context.aiResponse = answer ?? "";
          ctx.steps.push(makeStep("generate_ai_response", "AI Response", (answer ?? "").slice(0, 80), node.id));
        } catch (error) {
          captureError(error, { module: "engine.aiResponse" });
          ctx.context.aiResponse = "Sorry, I'm having trouble answering right now. Could you try again?";
        }
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "ask_question": {
        const question = renderTemplate(String(node.params.question ?? "Could you provide more details?"), vars);
        pushMessage(ctx, question);
        ctx.steps.push(makeStep("ask_question", "Question", question, node.id));
        await pauseWorkflow(ctx, node);
        return;
      }
      case "collect_field": {
        const fieldKey = String(node.params.field ?? "");
        const label = String(node.params.label ?? fieldKey);
        const existing = getValueForField(ctx, fieldKey);
        if (existing !== undefined && existing !== null && existing !== "") {
          ctx.steps.push(makeStep("collect_field", label, `already set: ${String(existing)}`, node.id));
          nodeId = getNextNodeId(def, node.id);
          break;
        }
        const entities = (ctx.context.entities ?? {}) as Record<string, unknown>;
        const aliasKey = FIELD_ENTITY_ALIASES[fieldKey];
        const autoFill = entities[fieldKey] ?? (aliasKey !== undefined ? entities[aliasKey] : undefined);
        if (autoFill !== undefined && autoFill !== null && autoFill !== "") {
          setNested(ctx.context, `fields.${fieldKey}`, autoFill);
          ctx.steps.push(makeStep("collect_field", label, `auto-filled: ${String(autoFill)}`, node.id));
          nodeId = getNextNodeId(def, node.id);
          break;
        }
        const question = renderTemplate(String(node.params.question ?? `Could you share your ${label}?`), vars);
        pushMessage(ctx, question);
        ctx.steps.push(makeStep("collect_field", `Collect ${label}`, question, node.id));
        await pauseWorkflow(ctx, node);
        return;
      }
      case "condition": {
        const outcome = evaluateCondition(node, ctx);
        ctx.steps.push(makeStep("condition", "Condition", `branch: ${outcome ? "true" : "false"}`, node.id));
        nodeId = getBranchNodeId(def, node.id, outcome) ?? getNextNodeId(def, node.id);
        break;
      }
      case "save_contact": {
        const name = String(getValueForField(ctx, "name") ?? ctx.contact.name ?? "");
        const phone = String(getValueForField(ctx, "phone") ?? ctx.contact.phone ?? "");
        if (name || phone) {
          await prisma.contact.update({
            where: { id: ctx.contact.id },
            data: { ...(name ? { name } : {}), ...(phone && !ctx.contact.phone ? { phone } : {}) },
          });
          ctx.steps.push(makeStep("save_contact", "Save Contact", name || phone || "updated", node.id));
        }
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "create_lead": {
        const lead = await createLeadFromContext(ctx);
        ctx.context.leadId = lead.id;
        ctx.steps.push(makeStep("lead_created", "Create Lead", lead.name ? `${lead.name} · score ${lead.score}` : "new lead", node.id));
        await notifyBusinessMembers({
          businessId: ctx.business.id,
          type: "lead_created",
          title: `New lead: ${lead.name || "WhatsApp lead"}`,
          content: lead.requirement || lead.phone || "New enquiry via WhatsApp",
          data: { leadId: lead.id, conversationId: ctx.conversation.id },
        });
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "update_lead": {
        const leadId = String(ctx.context.leadId ?? "");
        if (leadId) {
          const data: Record<string, unknown> = {};
          if (node.params.status) data.status = String(node.params.status);
          if (typeof node.params.score === "number") data.score = node.params.score as number;
          if (node.params.score === "auto") data.score = scoreLead((ctx.context.fields ?? {}) as Record<string, unknown>);
          await updateLead(leadId, data);
          ctx.steps.push(makeStep("update_lead", "Update Lead", String(data.status ?? "updated"), node.id));
        }
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "create_booking": {
        const outcome = await createBookingFromContext(ctx, node);
        if (!outcome.ok) {
          pushMessage(ctx, outcome.message ?? "Sorry, that slot is unavailable — please pick another.");
          const ctxFields = (ctx.context.fields ?? {}) as Record<string, unknown>;
          delete ctxFields.preferredDate;
          delete ctxFields.preferredTime;
          const retryId = findCollectNodeId(def, "preferredDate") ?? node.id;
          await pauseWorkflow(ctx, node, retryId);
          return;
        }
        ctx.context.appointmentId = outcome.appointment!.id;
        ctx.steps.push(makeStep("appointment_created", "Booking Created", `${outcome.appointment!.service || "Booking"} · ${formatSlot(outcome.appointment!.date)}`, node.id));
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "send_message": {
        let text = "";
        if (node.params.templateId) {
          const t = await prisma.messageTemplate.findFirst({
            where: { id: String(node.params.templateId), businessId: ctx.business.id, status: "active" },
          });
          if (t) text = renderTemplate(t.content, vars);
        }
        if (!text && node.params.textFrom === "aiResponse") text = String(ctx.context.aiResponse ?? "");
        if (!text && node.params.text) text = renderTemplate(String(node.params.text), vars);
        if (text) {
          pushMessage(ctx, text);
          ctx.steps.push(makeStep("message_sent", "Send Message", text.slice(0, 80), node.id));
        }
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "send_notification": {
        const title = renderTemplate(String(node.params.title ?? "Update"), vars);
        const content = renderTemplate(String(node.params.content ?? ""), vars);
        await notifyBusinessMembers({ businessId: ctx.business.id, type: "system", title: title.slice(0, 200), content: content || null, data: { workflowId } });
        ctx.steps.push(makeStep("send_notification", "Notification", title.slice(0, 60), node.id));
        nodeId = getNextNodeId(def, node.id);
        break;
      }
      case "human_handoff": {
        const ack = node.params.message ? renderTemplate(String(node.params.message), vars) : undefined;
        if (ack) pushMessage(ctx, ack);
        await performHandoff(ctx, "Human handoff workflow node reached.", resultOf(ctx));
        return;
      }
      case "wait": {
        const minutes = Math.max(1, Number(node.params.durationMinutes ?? 1440));
        ctx.context.waitUntil = new Date(Date.now() + minutes * 60_000).toISOString();
        if (ctx.executionId) {
          await prisma.workflowExecution.updateMany({
            where: { id: ctx.executionId },
            data: { status: "WAITING", currentNodeId: node.id, context: cloneJson(ctx.context) },
          });
        }
        ctx.steps.push(makeStep("wait", "Wait", `${minutes} minutes`, node.id));
        ctx.workflowState = { workflowId, currentNodeId: node.id, executionId: ctx.executionId, context: ctx.context, waitingForNodeId: null };
        return;
      }
      case "end": {
        if (ctx.executionId) {
          await prisma.workflowExecution.updateMany({
            where: { id: ctx.executionId },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
        ctx.steps.push(makeStep("end", "End", "workflow completed", node.id));
        ctx.workflowState = null;
        return;
      }
      default: {
        nodeId = getNextNodeId(def, node.id);
        break;
      }
    }
  }
}

// ── State persistence ──
async function pauseWorkflow(ctx: RunContext, node: WorkflowNode, retryNodeId?: string | null): Promise<void> {
  ctx.workflowState = {
    workflowId: ctx.workflowState?.workflowId ?? "",
    currentNodeId: node.id,
    executionId: ctx.executionId,
    context: ctx.context,
    waitingForNodeId: retryNodeId ?? node.id,
  };
  if (ctx.executionId) {
    await prisma.workflowExecution.updateMany({
      where: { id: ctx.executionId },
      data: { currentNodeId: node.id, context: cloneJson(ctx.context) },
    });
  }
}

function cloneJson(value: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(value ?? {})) as object;
}

function resultOf(ctx: RunContext): HandleResult {
  return {
    messages: ctx.messages,
    steps: ctx.steps,
    newStatus: ctx.conversation.status,
    intent: String(ctx.context.intent ?? null),
    workflowState: ctx.workflowState,
  };
}

function finalize(ctx: RunContext, result: HandleResult): HandleResult {
  result.workflowState = ctx.workflowState;
  if (!result.intent) result.intent = String(ctx.context.intent ?? null);
  result.leadId = (ctx.context.leadId as string | undefined) ?? result.leadId ?? null;
  result.appointmentId = (ctx.context.appointmentId as string | undefined) ?? result.appointmentId ?? null;
  if (result.escalation) {
    result.workflowState = null;
    result.newStatus = "HUMAN_HANDOFF";
    return result;
  }
  if (ctx.workflowState) {
    result.newStatus = statusForIntent(result.intent);
  } else if (result.newStatus === ctx.conversation.status) {
    result.newStatus = "COMPLETED";
  }
  return result;
}

async function parseAnswerValue(ctx: RunContext, fieldKey: string, raw: string): Promise<unknown> {
  const value = raw.trim();
  if (fieldKey === "preferredDate" || fieldKey === "date") {
    const d = parseFlexibleDate(value);
    return d ? d.toISOString().slice(0, 10) : value;
  }
  if (fieldKey === "preferredTime" || fieldKey === "time") {
    const t = parseFlexibleTime(value);
    return t ?? value;
  }
  return value;
}

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== "object" || current[part] === null) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(node: WorkflowNode, ctx: RunContext): boolean {
  const field = String(node.params.field ?? "");
  const operator = String(node.params.operator ?? "is_not_empty");
  const expected = node.params.value as unknown;
  let actual = getNested(ctx.context, field);
  if (actual === undefined) actual = getValueForField(ctx, field);
  switch (operator) {
    case "is_not_empty": return actual !== undefined && actual !== null && actual !== "";
    case "is_empty": return actual === undefined || actual === null || actual === "";
    case "equals": return String(actual ?? "") === String(expected ?? "");
    case "not_equals": return String(actual ?? "") !== String(expected ?? "");
    case "contains": return String(actual ?? "").includes(String(expected ?? ""));
    case "in": return (Array.isArray(expected) ? expected : String(expected ?? "").split(",")).map((x) => String(x).trim()).includes(String(actual ?? ""));
    case "not_in": return !(Array.isArray(expected) ? expected : String(expected ?? "").split(",")).map((x) => String(x).trim()).includes(String(actual ?? ""));
    case "gt": { const a = Number(actual); return !isNaN(a) && a > Number(expected); }
    case "gte": { const a = Number(actual); return !isNaN(a) && a >= Number(expected); }
    case "lt": { const a = Number(actual); return !isNaN(a) && a < Number(expected); }
    case "lte": { const a = Number(actual); return !isNaN(a) && a <= Number(expected); }
    default: return true;
  }
}

function findCollectNodeId(def: WorkflowDefinition, fieldKey: string): string | null {
  const node = def.nodes.find((n) => n.type === "collect_field" && n.params.field === fieldKey);
  return node?.id ?? null;
}

function collectFields(ctx: RunContext): Record<string, unknown> {
  const fields = (ctx.context.fields ?? {}) as Record<string, unknown>;
  const entities = (ctx.context.entities ?? {}) as Record<string, unknown>;
  return { ...(entities ?? {}), ...(fields ?? {}) };
}

function stringify(value: unknown): string {
  const s = String(value ?? "");
  return s === "undefined" ? "" : s;
}

async function createLeadFromContext(ctx: RunContext) {
  const data = collectFields(ctx);
  const name = stringify(data.name);
  const phone = stringify(data.phone);
  const email = stringify(data.email);
  const requirement = stringify(data.requirement ?? String(ctx.context.message ?? "").slice(0, 500));
  return createLead({
    businessId: ctx.business.id,
    contactId: ctx.contact.id,
    conversationId: ctx.conversation.id,
    name,
    phone: phone || ctx.contact.phone || null,
    email: email || null,
    source: ctx.conversation.channel,
    requirement: requirement || null,
    fields: data,
    score: scoreLead(data),
  });
}

async function createBookingFromContext(ctx: RunContext, node: WorkflowNode) {
  const data = collectFields(ctx);
  const dateVal = data.preferredDate ?? data.date;
  const timeVal = data.preferredTime ?? data.time;
  if (!dateVal || !timeVal) {
    return { ok: false, message: "I still need your preferred date and time. Let's book that slot." };
  }
  const date = parseFlexibleDate(dateVal);
  const time = parseFlexibleTime(timeVal);
  if (!date) return { ok: false, message: "I didn't catch the date. Could you share it again? (e.g. tomorrow)" };
  if (!time) return { ok: false, message: "I didn't catch the time. Could you share it again? (e.g. 3 PM)" };
  const slot = combineDateAndTime(date, time);
  const availability = await checkAvailability({ businessId: ctx.business.id, date: slot });
  if (!availability.available) {
    return { ok: false, message: availability.reason ?? "That slot is unavailable at the moment." };
  }
  const service = stringify(node.params.service ?? data.service ?? data.occasion ?? "Booking");
  const partySize = stringify(data.partySize ?? data.quantity ?? "");
  const notes = [partySize ? `${partySize} guests` : "", stringify(data.notes)].filter(Boolean).join(" · ") || null;
  const appointment = await createAppointment({
    businessId: ctx.business.id,
    contactId: ctx.contact.id,
    leadId: (ctx.context.leadId as string | null) ?? null,
    service,
    date: slot,
    status: "CONFIRMED",
    notes,
  });
  if (ctx.context.leadId) {
    await updateLead(String(ctx.context.leadId), { status: "APPOINTMENT" });
  }
  await notifyBusinessMembers({
    businessId: ctx.business.id,
    type: "booking",
    title: `New booking: ${service || "Appointment"}`,
    content: `${formatSlot(slot)}${notes ? ` · ${notes}` : ""}`,
    data: { appointmentId: appointment.id, conversationId: ctx.conversation.id },
  });
  return { ok: true, appointment };
}

function formatSlot(date: Date): string {
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function pushMessage(ctx: RunContext, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  ctx.messages.push({ text: trimmed, templateId: null });
}

async function findWorkflowForIntent(businessId: string, intent: string) {
  const workflows = await prisma.workflow.findMany({
    where: { businessId, active: true, trigger: "message_received" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, name: true, intents: true, definition: true },
  });
  const exact = workflows.find((w) => (w.intents ?? []).includes(intent));
  if (exact) return exact;
  const fallback = workflows.find((w) => (w.intents ?? []).length === 0);
  return fallback ?? null;
}

async function detectEscalation(text: string, modules: Record<string, boolean>): Promise<string | null> {
  if (modules.humanHandoff === false) return null;
  const probe = localClassifyIntent({
    message: text,
    businessName: "",
    businessType: "",
    modules: { ...modules, humanHandoff: true },
    knowledge: [],
  });
  if (probe.intent === "human_agent" && probe.confidence >= 0.7) {
    return "The customer requested a human agent.";
  }
  if (probe.intent === "complaint" && probe.confidence >= 0.65) {
    return "A complaint was detected in the customer's message.";
  }
  return null;
}

async function performHandoff(ctx: RunContext, reason: string, result: HandleResult): Promise<HandleResult> {
  if (ctx.messages.length === 0) {
    pushMessage(ctx, "I've connected you with a team member who will assist you shortly. 🙏");
  }
  await notifyBusinessMembers({
    businessId: ctx.business.id,
    type: "handoff",
    title: `🔔 Human handoff needed — ${ctx.business.name}`,
    content: reason,
    data: { conversationId: ctx.conversation.id },
  });
  result.newStatus = "HUMAN_HANDOFF";
  result.workflowState = null;
  result.escalation = "handoff";
  return result;
}

async function loadRecentMessages(conversationId: string): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { role: true, content: true },
  });
  return messages.reverse().map((m) => ({
    role: (m.role === "user" || m.role === "assistant" ? m.role : "assistant") as "user" | "assistant",
    content: m.content,
  }));
}

export async function runDueFollowUps(): Promise<number> {
  const candidates = await prisma.conversation.findMany({
    where: { aiEnabled: true, workflowState: { not: Prisma.DbNull } },
    select: { id: true, businessId: true, contactId: true, workflowState: true },
    take: 200,
  });
  let processed = 0;
  for (const conv of candidates) {
    try {
      const state = conv.workflowState as WorkflowState | null;
      if (!state?.workflowId || !state.executionId || !state.waitUntil) continue;
      if (new Date(state.waitUntil).getTime() > Date.now()) continue;
      const wf = await prisma.workflow.findUnique({ where: { id: state.workflowId } });
      if (!wf?.active) continue;
      const def = parseDefinition(wf.definition);
      const waitNode = findNode(def, state.currentNodeId ?? "");
      if (!waitNode || waitNode.type !== "wait") continue;

      const [business, contact, conversation] = await Promise.all([
        prisma.business.findUnique({ where: { id: conv.businessId }, include: { settings: true } }),
        prisma.contact.findUnique({ where: { id: conv.contactId } }),
        prisma.conversation.findUnique({ where: { id: conv.id } }),
      ]);
      if (!business || !contact || !conversation) continue;

      const ctx: RunContext = {
        business: business as never,
        contact: contact as never,
        conversation: conversation as never,
        settings: business.settings as never,
        modules: ((business.settings?.modules as Record<string, boolean> | null) ?? DEFAULT_MODULES) as Record<string, boolean>,
        text: "",
        context: (state.context ?? {}) as Record<string, unknown>,
        messages: [],
        steps: [],
        knowledge: [],
        history: [],
        executionId: state.executionId,
        workflowState: state,
      };

      const nextId = getNextNodeId(def, waitNode.id);
      ctx.steps.push(makeStep("wait", "Follow-up", "wait elapsed", waitNode.id));
      await runFrom(ctx, wf.id, def, nextId);

      for (const out of ctx.messages) {
        await prisma.message.create({
          data: {
            businessId: conv.businessId,
            conversationId: conv.id,
            role: "assistant",
            content: out.text,
            status: "sent",
            metadata: { source: "followup" },
          },
        });
      }

      await prisma.workflowExecution.updateMany({
        where: { id: state.executionId },
        data: {
          status: ctx.workflowState ? "WAITING" : "COMPLETED",
          ...(ctx.workflowState ? {} : { completedAt: new Date() }),
        },
      });

      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          workflowState: ctx.workflowState ? (ctx.workflowState as object) : Prisma.JsonNull,
          status: "COMPLETED",
          lastMessageAt: new Date(),
        },
      });

      processed += 1;
    } catch (error) {
      captureError(error, { module: "engine.followup", conversationId: conv.id });
    }
  }
  return processed;
}
