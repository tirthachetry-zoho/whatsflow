import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

export interface CreateLeadInput {
  businessId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string;
  score?: number;
  requirement?: string | null;
  assignedAgentId?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  fields?: Record<string, unknown> | null;
}

export async function createLead(input: CreateLeadInput) {
  return prisma.lead.create({
    data: {
      businessId: input.businessId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source ?? "manual",
      status: input.status ?? "NEW",
      score: input.score ?? 0,
      requirement: input.requirement ?? null,
      assignedAgentId: input.assignedAgentId ?? null,
      contactId: input.contactId ?? null,
      conversationId: input.conversationId ?? null,
      fields: (input.fields as object) ?? undefined,
    },
  });
}

export async function updateLead(leadId: string, input: Partial<CreateLeadInput>) {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new NotFoundError("Lead not found.");
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.source !== undefined) data.source = input.source;
  if (input.status !== undefined) data.status = input.status;
  if (input.score !== undefined) data.score = input.score;
  if (input.requirement !== undefined) data.requirement = input.requirement;
  if (input.fields !== undefined) data.fields = input.fields as object;
  return prisma.lead.update({ where: { id: leadId }, data });
}

export function scoreLead(fields: Record<string, unknown> | null | undefined): number {
  const f = fields ?? {};
  let score = 0;
  if (f.name) score += 20;
  if (f.phone) score += 25;
  if (f.email) score += 15;
  if (f.budget || f.requirement) score += 20;
  if (f.preferredDate || f.preferredTime) score += 10;
  if (Object.keys(f).length >= 5) score += 10;
  return Math.min(100, score);
}
