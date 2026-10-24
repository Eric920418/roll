import { after } from "next/server";
import { trySyncUserReferral } from "@/lib/referrals/service";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { browserMutationGuard } from "@/lib/security/http";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { PlanWriteError } from "@/lib/action-plan/service";
import { confirmFounderPayment } from "@/lib/discovery/founder";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const parsed = z.object({ orderId: z.string().regex(/^[A-Za-z0-9]{5,64}$/) }).strict().safeParse(await req.json());
    if (!parsed.success) return fail("付款訂單 ID 無效 / Invalid payment order ID", 400);
    if (!(await checkRateLimit(`founder:capture:${session.uid}`, 10, MINUTE_MS)).ok) return fail("確認過於頻繁，請稍後重試；勿重新付款 / Too many confirmation attempts; retry shortly. Do not pay again", 429);
    const result = await confirmFounderPayment(session.uid, parsed.data.orderId);
    after(() => trySyncUserReferral(session.uid));
    return ok(result);
  } catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}
