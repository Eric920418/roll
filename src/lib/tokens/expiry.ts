import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { settleTokens } from "./service";
export async function expireTokens(userId?: string) {
  // Exclude uncertain submitted orders so they cannot starve refundable holds in the sweep.
  const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT r."id" FROM "TokenReservation" r WHERE r."status" = 'reserved' AND r."expiresAt" <= NOW() AND (${userId || null}::text IS NULL OR r."userId" = ${userId || null}) AND ((r."kind" = 'invite' AND EXISTS (SELECT 1 FROM "NetworkConnection" c WHERE c."id" = r."resourceId" AND c."status" = 'pending' AND c."revision" = r."resourceVersion")) OR (r."kind" = 'search' AND EXISTS (SELECT 1 FROM "ProspectingOrder" o WHERE o."id" = r."resourceId" AND o."submittedAt" IS NULL AND o."providerOrderId" IS NULL AND o."status" <> 'completed' AND (o."leaseUntil" IS NULL OR o."leaseUntil" <= NOW())))) ORDER BY r."expiresAt", r."id" LIMIT 100`;
  const due = await prisma.tokenReservation.findMany({ where: { id: { in: ids.map(row => row.id) } } });
  let released = 0;
  for (const hold of due) {
    const expired = await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      if (hold.kind === "invite") {
        await tx.$queryRaw`SELECT "id" FROM "NetworkConnection" WHERE "id" = ${hold.resourceId} FOR UPDATE`;
        const connection = await tx.networkConnection.findUnique({ where: { id: hold.resourceId } });
        const fresh = await tx.tokenReservation.findUniqueOrThrow({ where: { id: hold.id } });
        if (fresh.status !== "reserved") return false;
        if (connection?.status === "pending" && connection.revision === hold.resourceVersion) {
          await tx.networkConnection.update({ where: { id: connection.id }, data: { status: "expired", revision: { increment: 1 } } });
          await settleTokens(tx, hold.id, "refund", "七日未回覆，退回預扣 / No reply within seven days; hold released"); return true;
        }
      } else if (hold.kind === "search") {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${hold.userId} FOR UPDATE`;
        const order = await tx.prospectingOrder.findUnique({ where: { id: hold.resourceId } });
        const fresh = await tx.tokenReservation.findUniqueOrThrow({ where: { id: hold.id } });
        if (fresh.status !== "reserved" || !order || order.status === "completed" || order.leaseUntil && order.leaseUntil > new Date()) return false;
        if (!order.submittedAt && !order.providerOrderId) {
          await tx.prospectingOrder.update({ where: { id: order.id }, data: { status: "failed", reservedCount: 0, failureCode: "hold_expired", failureMessage: "搜尋未送出且預扣已逾期，20 Token 已退回 / Search was not submitted; expired 20 Token hold released" } });
          await settleTokens(tx, hold.id, "refund", "未送出搜尋逾期 / Unsubmitted search expired"); return true;
        }
      }
      return false;
    });
    if (expired) released++;
  }
  return { checked: due.length, released };
}
