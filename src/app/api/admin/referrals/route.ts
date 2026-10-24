import { browserMutationGuard } from "@/lib/security/http";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { reviewReferral } from "@/lib/referrals/service";
import { ReferralError } from "@/lib/referrals/policy";
import { referralOk, referralFailure } from "@/lib/referrals/http";
async function admin() {
  const session = await getAdminSession(); if (!session) throw new ReferralError("管理員登入失效 / Admin login required", 401, "unauthorized");
  if (!(await checkRateLimit("admin-referrals", 60, MINUTE_MS)).ok) throw new ReferralError("請稍後重試 / Retry later", 429, "rate_limited");
  return session;
}
export async function GET(req: Request) {
  try {
    await admin(); const page = z.coerce.number().int().min(1).max(10000).parse(new URL(req.url).searchParams.get("page") ?? 1);
    const rows = await prisma.referral.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 21, select: { id: true, revision: true, status: true, reason: true, errorRequestId: true, paymentKey: true, paidAt: true, eligibleAt: true, checkedAt: true, reviewNote: true, reviewedAt: true, reviewedBy: true } });
    const payments = await prisma.referralPayment.findMany({ where: { key: { in: rows.flatMap(row => row.paymentKey ? [row.paymentKey] : []) } }, select: { key: true, kind: true, orderId: true, subscriptionId: true, amountMinor: true, currency: true } });
    return referralOk({ rows: rows.slice(0, 20).map(row => ({ ...row, payment: payments.find(payment => payment.key === row.paymentKey) ?? null })), hasMore: rows.length > 20 });
  } catch (error) { return referralFailure(error); }
}
export async function PATCH(req: Request) {
  const blocked = browserMutationGuard(req);
  if (blocked) { const body = await blocked.json(); return referralFailure(new ReferralError(body.error, blocked.status, body.code)); }
  try {
    const session = await admin();
    const input = z.object({ id: z.string().cuid(), revision: z.number().int().nonnegative(), decision: z.enum(["approve", "reject"]), note: z.string().trim().min(5).max(1000), payerId: z.string().regex(/^[A-Za-z0-9_-]{5,128}$/).optional() }).strict().parse(await req.json());
    await reviewReferral(input, session.email); return referralOk({ saved: true });
  } catch (error) { return referralFailure(error); }
}
