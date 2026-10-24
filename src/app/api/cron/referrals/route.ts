import { timingSafeEqual } from "node:crypto";
import { runReferralReconciliation } from "@/lib/referrals/service";
import { ReferralError } from "@/lib/referrals/policy";
import { referralFailure, referralOk } from "@/lib/referrals/http";
export const maxDuration = 300;
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET, actual = Buffer.from(req.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
    if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ReferralError("Unauthorized", 401, "unauthorized");
    return referralOk(await runReferralReconciliation());
  } catch (error) { return referralFailure(error); }
}
