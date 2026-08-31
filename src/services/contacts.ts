import { prisma } from "@/lib/prisma";

export interface UpsertContactInput {
  businessId: string;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  source?: string;
  tags?: string[];
  customFields?: Record<string, unknown> | null;
}

export async function getOrCreateContact(input: UpsertContactInput) {
  const phone = input.phone?.trim() || null;
  if (phone) {
    const existing = await prisma.contact.findFirst({
      where: { businessId: input.businessId, phone },
    });
    if (existing) {
      return prisma.contact.update({
        where: { id: existing.id },
        data: {
          ...(input.name && !existing.name ? { name: input.name } : {}),
          lastSeenAt: new Date(),
        },
      });
    }
  }
  return prisma.contact.create({
    data: {
      businessId: input.businessId,
      phone,
      name: input.name ?? null,
      email: input.email ?? null,
      source: input.source ?? "whatsapp",
      tags: input.tags ?? [],
      customFields: (input.customFields as object) ?? undefined,
    },
  });
}
