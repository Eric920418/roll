import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { salesRecordSchema } from "@/lib/validation/schema";
import { PlanWriteError, lockActivePlan } from "../service";
import { verifyProof } from "@/lib/validation/proof";
import { today } from "@/lib/roadmap/schema";

export async function evidenceQueue() {
  const deals = await prisma.deal.findMany({ where: { validation: { not: Prisma.DbNull } }, orderBy: { updatedAt: "asc" } });
  return deals.flatMap(deal => {
    const record = salesRecordSchema.safeParse(deal.validation).data;
    return record ? record.proofs.filter(p => p.review && !p.revokedAt).map(p => ({ dealId: deal.id, proofId: p.id, version: record.version, company: record.company, kind: p.kind, amount: p.amount, currency: p.currency, date: p.date, filename: p.filename, status: p.review!.status, note: p.review!.note || "", reviewedAt: p.review!.at || null })) : [];
  });
}
export async function reviewEvidence(admin: string, input: { dealId: string; proofId: string; version: number; status: "approved" | "rejected"; note: string }) {
  if (input.status === "approved") {
    const deal = await prisma.deal.findUnique({ where: { id: input.dealId }, select: { userId: true, validation: true } });
    const record = salesRecordSchema.safeParse(deal?.validation).data, proof = record?.proofs.find(p => p.id === input.proofId && p.review);
    if (!deal || !proof) throw new PlanWriteError("找不到待審證明 / Evidence not found", 404);
    await verifyProof(deal.userId, proof);
  }
  await prisma.$transaction(async raw => {
    const tx = raw as Prisma.TransactionClient;
    const initial = await tx.deal.findUnique({ where: { id: input.dealId }, include: { user: { select: { email: true } } } });
    const source = salesRecordSchema.safeParse(initial?.validation).data;
    if (!initial || !source?.scope.planId) throw new PlanWriteError("找不到新版證據 / New workflow evidence not found", 404);
    if (initial.user.email.toLowerCase() === admin.toLowerCase()) throw new PlanWriteError("不可審核自己的證據 / You cannot review your own proof", 403);
    const active = await tx.actionPlan.findFirst({ where: { id: source.scope.planId, userId: initial.userId, activeKey: initial.userId, archivedAt: null }, select: { id: true } });
    if (!active) throw new PlanWriteError("原計畫已封存，不能變更其證據 / The source plan is archived", 409);
    await lockActivePlan(tx, initial.userId, active.id);
    const deal = await tx.deal.findUniqueOrThrow({ where: { id: initial.id } }), record = salesRecordSchema.parse(deal.validation);
    if (record.version !== input.version) throw new PlanWriteError("證據已更新，請重新載入再核對 / Evidence changed; reload and review", 409);
    const proof = record.proofs.find(p => p.id === input.proofId);
    if (!proof?.review || proof.revokedAt) throw new PlanWriteError("證據無效或已撤銷 / Invalid or revoked evidence", 409);
    if (input.status === "approved" && proof.date > today()) throw new PlanWriteError("不能認可未來的付款／簽約日期 / Future payment or signing dates cannot be approved", 400);
    const at = new Date().toISOString(), history = [...(proof.review.history || []), { status: input.status, by: admin, note: input.note, at }];
    if (history.length > 50) throw new PlanWriteError("審核變更過多，請提交新的證據 / Too many review changes; submit new evidence", 409);
    proof.review = { status: input.status, by: admin, note: input.note, at, history };
    record.version++;
    await tx.deal.update({ where: { id: deal.id }, data: { validation: record as Prisma.InputJsonValue } });
    if (process.env.MEMBER_NETWORK_ENABLED === "true") await (await import("@/lib/network/watches")).evaluateWatches(tx, initial.userId);
  });
  return evidenceQueue();
}
