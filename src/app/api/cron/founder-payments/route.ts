import { timingSafeEqual } from "node:crypto";
import { reconcileFounderPayments } from "@/lib/discovery/founder";
import { failFromError, ok } from "@/lib/api";
import { nextFounderWorkAt, invalidateFounderSchedule } from "@/lib/cron/schedules";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, actual = Buffer.from(req.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try {
    const next = await nextFounderWorkAt();
    if (!next || Date.parse(next) > Date.now()) {
      console.info({ event: "founder_payment.cron_idle", nextWorkAt: next });
      return ok({ checked: 0, recovered: 0, closed: 0, pending: 0, failed: 0, refundsChecked: 0, idle: true });
    }
    try { return ok(await reconcileFounderPayments()); }
    finally { invalidateFounderSchedule(); }
  } catch (error) { return failFromError(error); }
}
