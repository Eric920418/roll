import { browserMutationGuard } from "@/lib/security/http";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { referralSummary } from "@/lib/referrals/service";
import { ensureReferralAccount } from "@/lib/referrals/registration";
import { ReferralError } from "@/lib/referrals/policy";
import { referralOk, referralFailure } from "@/lib/referrals/http";
async function access(write = false) {
  const session = await getUserSession();
  if (!session) throw new ReferralError("請重新登入 / Please log in", 401, "unauthorized");
  if (!(await checkRateLimit(`referral-${write ? 'write' : 'read'}:${session.uid}`, write ? 20 : 90, MINUTE_MS)).ok) throw new ReferralError("請求過於頻繁，請稍後重試 / Too many attempts; retry later", 429, "rate_limited");
  return session.uid;
}
export async function GET(req: Request) {
  try { const uid = await access(); const page = z.coerce.number().int().min(1).max(10000).parse(new URL(req.url).searchParams.get("page") ?? 1); return referralOk(await referralSummary(uid, page)); }
  catch (error) { return referralFailure(error); }
}
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req);
  if (blocked) { const body = await blocked.json(); return referralFailure(new ReferralError(body.error, blocked.status, body.code)); }
  try { const uid = await access(true); z.object({}).strict().parse(await req.json()); await ensureReferralAccount(uid); return referralOk(await referralSummary(uid, 1)); }
  catch (error) { return referralFailure(error); }
}
