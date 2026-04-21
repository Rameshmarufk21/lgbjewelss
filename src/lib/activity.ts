import { prisma } from "@/lib/prisma";

export async function logActivity(input: {
  productId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  payload?: unknown;
}) {
  await prisma.activityLog.create({
    data: {
      productId: input.productId ?? undefined,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payloadJson: input.payload !== undefined ? JSON.stringify(input.payload) : null,
    },
  });
}
