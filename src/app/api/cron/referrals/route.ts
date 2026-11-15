import { timingSafeEqual } from "node:crypto";
import { runReferralReconciliation } from "@/lib/referrals/service";
import { ReferralError } from "@/lib/referrals/policy";
import { referralFailure, referralOk } from "@/lib/referrals/http";
import { requireReferralConfig } from "@/lib/referrals/registration";
import { nextReferralWorkAt, invalidateReferralSchedule } from "@/lib/cron/schedules";
export const maxDuration = 300;
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET, actual = Buffer.from(req.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
    if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ReferralError("Unauthorized", 401, "unauthorized");
    requireReferralConfig();
    const next = await nextReferralWorkAt();
    if (!next || Date.parse(next) > Date.now()) {
      console.info({ event: "referral.cron_idle", nextWorkAt: next });
      return referralOk({ checked: 0, failed: 0, idle: true });
    }
    try { return referralOk(await runReferralReconciliation()); }
    finally { invalidateReferralSchedule(); }
  } catch (error) { return referralFailure(error); }
}
