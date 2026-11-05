import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/api";
import { MemberError, memberError, privateOk } from "@/lib/member-http";
import { browserMutationGuard } from "@/lib/security/http";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { grantTokens, tokenSnapshot, resourceFee, settleTokens } from "@/lib/tokens/service";
const adjustment = z.object({ userId: z.string().min(1).max(200), requestId: z.uuid(), amount: z.number().int().min(-1000000).max(1000000).refine(v => v !== 0), reason: z.string().trim().min(5).max(500) }).strict();
export async function GET(req: Request) {
  try {
    if (!await getAdminSession()) return unauthorized();
    const params = new URL(req.url).searchParams, userId = z.string().min(1).max(200).parse(params.get("userId"));
    return privateOk(await tokenSnapshot(userId, params.get("cursor") || undefined));
  } catch (error) { return memberError(error); }
}
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    if (!await getAdminSession()) return unauthorized();
    const input = adjustment.parse(await req.json());
    const saved = await prisma.$transaction(raw => grantTokens(raw as unknown as Prisma.TransactionClient, input.userId, input.amount, `admin:${input.userId}:${input.requestId}`, input.reason));
    return privateOk({ id: saved.id });
  } catch (error) { return memberError(error); }
}

const reconciliation = z.object({ orderId: z.uuid(), revision: z.string().datetime(), requestId: z.uuid(), action: z.enum(["attach_receipt", "confirm_no_delivery"]), providerOrderId: z.uuid().optional(), evidence: z.string().trim().min(10).max(1000) }).strict();
export async function PATCH(req: Request) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    if (!await getAdminSession()) return unauthorized();
    const input = reconciliation.parse(await req.json());
    const result = await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      const original = await tx.prospectingOrder.findUniqueOrThrow({ where: { id: input.orderId } });
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${original.userId} FOR UPDATE`;
      const order = await tx.prospectingOrder.findUniqueOrThrow({ where: { id: input.orderId } });
      const fee = await resourceFee(tx, "search", order.id);
      if (!fee) throw new MemberError("Token reservation missing");
      const metadata = fee.metadata as Record<string, Prisma.InputJsonValue>;
      const audit = { requestId: input.requestId, action: input.action, providerOrderId: input.providerOrderId || null, evidence: input.evidence };
      const history = Array.isArray(metadata.reconciliation) ? metadata.reconciliation : [];
      const replay = history.find(v => v && typeof v === "object" && !Array.isArray(v) && v.requestId === input.requestId);
      if (replay) {
        if (Object.entries(audit).every(([key, value]) => (replay as Record<string, unknown>)[key] === value)) return { saved: true };
        throw new MemberError("Reconciliation request ID has different content");
      }
      if (order.updatedAt.toISOString() !== input.revision || order.status !== "reconciling" || order.leaseUntil && order.leaseUntil > new Date() || fee.status !== "reserved") throw new MemberError("Order changed or is still processing; reload before reconciling");
      if (input.action === "attach_receipt") {
        if (!input.providerOrderId || order.providerOrderId && order.providerOrderId !== input.providerOrderId) throw new MemberError("A matching provider receipt ID is required");
        await tx.prospectingOrder.update({ where: { id: order.id }, data: { providerOrderId: input.providerOrderId, nextAttemptAt: new Date(), failureCode: "receipt_attached", failureMessage: "管理員已補供應商收據，等待核對 / Provider receipt attached; verification pending" } });
      } else {
        await settleTokens(tx, fee.id, "refund", "管理員核對供應商確認未交付 / Administrator verified provider confirmed no delivery");
        await tx.prospectingOrder.update({ where: { id: order.id }, data: { status: "failed", reservedCount: 0, failureCode: "admin_confirmed_no_delivery", failureMessage: "管理員已核對未交付，20 Token 已退回 / Administrator verified no delivery; 20 Token returned" } });
      }
      await tx.tokenReservation.update({ where: { id: fee.id }, data: { metadata: { ...metadata, reconciliation: [...history, audit] } } });
      return { saved: true };
    });
    return privateOk(result);
  } catch (error) { return memberError(error); }
}
