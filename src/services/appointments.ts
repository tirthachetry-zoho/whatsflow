import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

export interface CreateAppointmentInput {
  businessId: string;
  contactId?: string | null;
  leadId?: string | null;
  service?: string | null;
  date: Date;
  status?: string;
  notes?: string | null;
}

export async function createAppointment(input: CreateAppointmentInput) {
  return prisma.appointment.create({
    data: {
      businessId: input.businessId,
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      service: input.service ?? null,
      date: input.date,
      status: input.status ?? "PENDING",
      notes: input.notes ?? null,
    },
  });
}

export async function checkAvailability(input: {
  businessId: string;
  date: Date;
}): Promise<{ available: boolean; reason?: string }> {
  const { businessId, date } = input;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { settings: true },
  });
  if (!business) return { available: false, reason: "Business not found" };

  const settings = business.settings;
  const bookingConfig = (settings?.bookingConfig ?? {}) as { slotDurationMinutes?: number; maxPerSlot?: number; advanceDays?: number };
  const maxPerSlot = bookingConfig.maxPerSlot ?? 1;

  // 1. Future only
  const now = new Date();
  if (date.getTime() < now.setHours(0, 0, 0, 0)) {
    return { available: false, reason: "That date is in the past." };
  }

  // 2. Working hours
  const workingHours = (business.workingHours ?? null) as Record<string, { open: string; close: string } | null> | null;
  const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()]!;
  const dayConfig = workingHours?.[dayKey];

  if (workingHours && dayConfig) {
    const minutes = date.getHours() * 60 + date.getMinutes();
    const [openH, openM] = (dayConfig.open ?? "09:00").split(":").map((x) => parseInt(x, 10));
    const [closeH, closeM] = (dayConfig.close ?? "17:00").split(":").map((x) => parseInt(x, 10));
    const openTotal = openH * 60 + (openM || 0);
    const closeTotal = closeH * 60 + (closeM || 0);
    if (minutes < openTotal || minutes >= closeTotal) {
      return {
        available: false,
        reason: `We're closed at that time — our hours that day are ${dayConfig.open ?? "09:00"}–${dayConfig.close ?? "17:00"}. Please pick another slot.`,
      };
    }
  } else if (workingHours && !dayConfig) {
    return { available: false, reason: "We're closed that day — please pick another date." };
  }

  // 3. Slot capacity
  const slotMinutes = bookingConfig.slotDurationMinutes ?? 60;
  const slotStart = new Date(date);
  const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60_000);
  const existing = await prisma.appointment.count({
    where: {
      businessId,
      status: { in: ["PENDING", "CONFIRMED"] },
      date: { gte: slotStart, lt: slotEnd },
    },
  });
  if (existing >= maxPerSlot) {
    return { available: false, reason: "Sorry, that slot just got booked. Please pick another time." };
  }

  return { available: true };
}
