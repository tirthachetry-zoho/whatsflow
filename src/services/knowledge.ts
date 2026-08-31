import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";

export async function loadBusinessKnowledge(businessId: string, limit = 100) {
  return prisma.knowledgeBaseItem.findMany({
    where: { businessId, active: true },
    select: { type: true, title: true, content: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
