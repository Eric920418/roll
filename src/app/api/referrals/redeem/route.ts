import { z } from "zod";
import { browserMutationGuard } from "@/lib/security/http";
import { getUserSession } from "@/lib/auth/guard";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { redeemFreeMonth } from "@/lib/referrals/free-months";
import { ReferralError } from "@/lib/referrals/policy";
import { referralOk, referralFailure } from "@/lib/referrals/http";
const input = z.object({ benefitId: z.string().min(1).max(100), requestId: z.uuid(), confirmed: z.literal(true) }).strict();
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) throw new ReferralError("請重新登入 / Please log in", 401, "unauthorized");
    if (!(await checkRateLimit(`referral-month:${session.uid}`, 10, MINUTE_MS)).ok) throw new ReferralError("請稍後重試 / Retry shortly", 429, "rate_limited");
    const body = input.parse(await req.json());
    const result = await redeemFreeMonth(session.uid, body.benefitId, body.requestId);
    return referralOk({ id: result.id, status: result.status, plan: result.plan, startsAt: result.startsAt?.toISOString(), endsAt: result.endsAt?.toISOString() });
  } catch (error) { return referralFailure(error); }
}
