import type { AIProvider, ClassifyIntentInput, GenerateResponseInput, KnowledgeEntry, SummarizeInput } from "@/services/ai/types";
import type { IntentResult } from "@/types/workflow";
import { INTENTS, type Intent } from "@/lib/constants";

const PATTERNS: Array<{
  intent: Intent;
  weight: number;
  test: (message: string) => boolean;
  reason: string;
}> = [
  {
    intent: "human_agent",
    weight: 1.6,
    reason: "requested a human agent",
    test: (m) =>
      /(talk|speak|connect|reach|chat|put me|transfer).{0,25}(human|agent|person|representative|someone|operator)|human\s+(agent|being|representative)|real person|live agent|call me (back|please)|give me (a call|your number)|someone (call|contact) me/i.test(m),
  },
  {
    intent: "complaint",
    weight: 1.5,
    reason: "complaint detected",
    test: (m) =>
      /(complaint|refund|terrible|awful|worst|unhappy|dissatisfied|not happy|angry|useless|disappointed|poor (service|quality|experience)|problem with|issue with|something went wrong|wrong order|never arrived)/i.test(m),
  },
  {
    intent: "booking",
    weight: 1.3,
    reason: "booking language detected",
    test: (m) =>
      /\b(book|booking|booked|appointment|reserve|reservation|slot|schedule|fix a|table for|book a|shows? for|visit)\b|book for (today|tomorrow|tonight)|need a (appointment|slot|table)/i.test(m),
  },
  {
    intent: "greeting",
    weight: 1.2,
    reason: "greeting detected",
    test: (m) =>
      /^(hi|hii+|hey|heya|yo|hello|howdy|good\s(morning|afternoon|evening)|namaste|hola|good day)\b/i.test(m.trim()),
  },
  {
    intent: "order_status",
    weight: 1.2,
    reason: "order enquiry detected",
    test: (m) => /\b(order|my order|delivery|delivered|shipped|shipment|track|status of|refund of|place an order)\b/i.test(m),
  },
  {
    intent: "faq",
    weight: 1.1,
    reason: "factual question detected",
    test: (m) =>
      /\b(hours|timing|open|close|closed|location|address|where are you|parking|directions|what time|when are you|holiday|policy|free|rules)\b|how (do i|can i) (reach|find|get to)/i.test(m),
  },
  {
    intent: "payment",
    weight: 1.0,
    reason: "payment language detected",
    test: (m) => /\b(pay|payment|bill|invoice|transaction|upi|paytm|google pay|phonepe|gpay|payment link|due)\b/i.test(m),
  },
  {
    intent: "pricing",
    weight: 1.0,
    reason: "pricing question detected",
    test: (m) => /\b(price|prices|cost|costs|how much|charges|charge|rate|rates|fees|fee|package|offer|deal)\b/i.test(m),
  },
  {
    intent: "service_enquiry",
    weight: 0.9,
    reason: "service question detected",
    test: (m) =>
      /\b(services?|offer|do you have|what (services|treatments|procedures|classes|courses)|specialize|providers?)\b/i.test(m),
  },
  {
    intent: "product_enquiry",
    weight: 0.9,
    reason: "product question detected",
    test: (m) =>
      /\b(product|item|menu|dish|available|in stock|buy|purchase|ingredients|vegan|vegetarian)\b/i.test(m),
  },
  {
    intent: "lead",
    weight: 1.0,
    reason: "lead capture request detected",
    test: (m) =>
      /\b(interested|quote|quotation|consultation|join|admission|enroll|enrol|enquiry|inquiry|want to know|more info|details|callback|free trial|demo|estimate)\b|sign me up/i.test(m),
  },
  {
    intent: "unknown",
    weight: 0.1,
    reason: "no pattern matched",
    test: () => true,
  },
];

export const INTENT_MODULE_ALLOWLIST: Record<string, Intent[]> = {
  faq: ["faq", "pricing"],
  productEnquiry: ["product_enquiry", "service_enquiry", "pricing"],
  appointmentBooking: ["booking"],
  leadCapture: ["lead"],
  leadQualification: ["lead"],
  orderEnquiry: ["order_status"],
  paymentLink: ["payment"],
  humanHandoff: ["human_agent", "complaint"],
};

export function allowedIntents(modules?: Record<string, boolean>): Intent[] {
  const allowed = new Set<Intent>(["greeting", "unknown"]);
  for (const [moduleKey, intentList] of Object.entries(INTENT_MODULE_ALLOWLIST)) {
    if (modules?.[moduleKey] !== false) for (const intent of intentList) allowed.add(intent);
  }
  return [...allowed];
}

export function searchKnowledge(knowledge: KnowledgeEntry[], query: string): KnowledgeEntry[] {
  const q = query.toLowerCase();
  const scored = knowledge
    .map((item) => {
      const haystack = `${item.title} ${item.content}`.toLowerCase();
      let score = 0;
      if (haystack.includes(q)) score += 8;
      const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1;
      }
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((x) => x.item);
}

function extractEntities(message: string, knowledge: KnowledgeEntry[]): Record<string, string | number | null> {
  const entities: Record<string, string | number | null> = {};
  const text = message.trim();

  const NON_NAMES = new Set([
    "interested", "looking", "here", "wondering", "hoping", "calling", "checking",
    "just", "really", "trying", "new", "glad", "fine", "so", "very", "a", "an", "the",
  ]);

  for (const match of text.matchAll(/(?:my name is|i am|i'm|call me)\s+([A-Z][a-zA-Z]{2,30})/gi)) {
    const candidate = match[1]!.replace(/[,.;].*$/, "").trim();
    if (candidate && !NON_NAMES.has(candidate.toLowerCase())) {
      entities.name = candidate;
      break;
    }
  }

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (emailMatch) entities.email = emailMatch[0];

  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{3,4}\)?[\s-]?\d{3}[\s-]?\d{3,4}/);
  if (phoneMatch) entities.phone = phoneMatch[0]!.replace(/[\s()-]/g, "");

  const now = new Date();
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  let date: Date | null = null;
  if (/\bday after tomorrow\b/i.test(text)) date = addDays(now, 2);
  else if (/\btomorrow\b/i.test(text)) date = addDays(now, 1);
  else if (/\b(today|tonight)\b/i.test(text)) date = now;
  else if (/\bnext week\b/i.test(text)) date = addDays(now, 7);
  else {
    for (const [name, offset] of Object.entries(dayMap)) {
      if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
        let delta = (offset - now.getDay() + 7) % 7;
        if (delta === 0) delta = 7;
        date = addDays(now, delta);
        break;
      }
    }
  }
  const isoDate = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDate) date = new Date(`${isoDate[0]}T00:00:00`);
  if (date) entities.date = date.toISOString().slice(0, 10);

  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]!, 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2]!, 10) : 0;
    if (/pm/i.test(timeMatch[3]!) && h < 12) h += 12;
    if (/am/i.test(timeMatch[3]!) && h === 12) h = 0;
    entities.time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } else {
    const military = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (military) entities.time = `${String(parseInt(military[1]!, 10)).padStart(2, "0")}:${military[2]}`;
  }

  const budgetMatch = text.match(/(?:budget|around|under|less than|up to|max(?:imum)?)\s*(?:Rs\.?|₹|\$)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|cr)?/i);
  if (budgetMatch) {
    const num = parseFloat(budgetMatch[1]!.replace(/,/g, ""));
    const unit = (budgetMatch[2] ?? "").toLowerCase();
    entities.budget = unit === "k" || unit === "thousand" ? num * 1000 : unit === "lakh" ? num * 100000 : unit === "cr" ? num * 10000000 : num;
  }

  const partyMatch = text.match(/(?:table for|for|party of)\s*(\d{1,2})\s*(?:people|person|pax)?/i);
  if (partyMatch) entities.quantity = parseInt(partyMatch[1]!, 10);

  const lower = text.toLowerCase();
  for (const item of knowledge) {
    if (item.title.length > 2 && lower.includes(item.title.toLowerCase())) {
      entities.service = item.title;
      break;
    }
  }

  return entities;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export const FIELD_ENTITY_ALIASES: Record<string, string> = {
  preferredDate: "date",
  preferredTime: "time",
  partySize: "quantity",
  guests: "quantity",
};

export function localClassifyIntent(input: ClassifyIntentInput): IntentResult {
  const modules = input.modules ?? {};
  const allowed = allowedIntents(modules);
  const message = input.message;
  const matched = PATTERNS.filter((p) => allowed.includes(p.intent) && p.test(message))
    .sort((a, b) => b.weight - a.weight);
  const entities = extractEntities(message, input.knowledge);

  let top = matched[0] ?? PATTERNS[PATTERNS.length - 1]!;
  if (!allowed.includes(top.intent) || top.intent === "unknown" || top.weight < 1.3) {
    const hasSlot = entities.date !== undefined && entities.time !== undefined;
    if (hasSlot && allowed.includes("booking")) {
      top = PATTERNS.find((p) => p.intent === "booking")!;
    }
  }

  const confidence = Math.min(0.96, 0.55 + top.weight * 0.22);
  return { intent: top.intent, confidence, entities, reason: top.reason };
}

export function localGenerateResponse(input: GenerateResponseInput): string {
  const results = searchKnowledge(input.knowledge, input.message);
  const hit = results[0];
  if (results.length > 0 && hit) {
    const prefix = hit.type === "faq" ? "" : `Here's what I found${input.businessName ? ` at ${input.businessName}` : ""}:`;
    const body = hit.content && !hit.content.toLowerCase().includes(hit.title.toLowerCase())
      ? `${hit.title}\n${hit.content}`
      : `${hit.title}${hit.content ? `\n${hit.content}` : ""}`;
    return [prefix, body].filter(Boolean).join("\n");
  }
  if (input.intent === "booking") {
    return "I'd be happy to help with that! Could you tell me which service you're interested in and your preferred date & time?";
  }
  if (input.intent === "lead") {
    return "Great — I can help with that. Could you share your name and a good contact number so our team can reach out?";
  }
  if (input.intent === "human_agent" || input.intent === "complaint") {
    return "I understand — let me connect you with a team member who can help right away.";
  }
  if (input.intent === "greeting") {
    return `Hello! 👋 Welcome to ${input.businessName}. How can I help you today?`;
  }
  return `Thanks for your message! I've forwarded your query to our team — they'll get back to you shortly. Meanwhile, is there anything specific you'd like to know?`;
}

const LOCAL_PROVIDER: AIProvider = {
  name: "local-deterministic",
  isConfigured: () => true,
  classifyIntent: (input) => Promise.resolve(localClassifyIntent(input)),
  generateResponse: (input) => Promise.resolve(localGenerateResponse(input)),
  summarizeConversation: (input: SummarizeInput) => {
    const lines = input.messages.map((m) => `${m.role}: ${m.content}`);
    const summary = `Conversation of ${input.messages.length} message(s) with ${input.businessName}. ${lines.join(" | ")}`;
    return Promise.resolve(summary.slice(0, 500));
  },
};

export function getLocalProvider(): AIProvider {
  return LOCAL_PROVIDER;
}
