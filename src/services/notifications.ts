import { prisma } from "@/lib/prisma";

export interface CreateNotificationInput {
  businessId: string;
  type: string;
  title: string;
  content?: string | null;
  data?: Record<string, unknown>;
  userId?: string | null;
}

export async function notifyBusinessMembers(input: CreateNotificationInput) {
  const members = await prisma.businessMember.findMany({
    where: { businessId: input.businessId },
    select: { userId: true },
  });
  const targets = input.userId ? [input.userId] : members.map((m) => m.userId);
  const unreadTargets = targets.filter((id) => !!id);
  await prisma.notification.createMany({
    data: unreadTargets.map((userId) => ({
      businessId: input.businessId,
      userId: userId ?? null,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      data: (input.data as object) ?? undefined,
    })),
  });
}
