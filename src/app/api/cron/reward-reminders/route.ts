import { timingSafeEqual } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { rewardEmailConfigured, runRewardReminders } from "@/lib/rewards/reminders";
import { REWARD_REMINDER_SCHEDULE_TAG } from "@/lib/rewards/policy";
import { privateRewardResponse, rewardFailure } from "@/lib/rewards/http";

// Cache only the next work time, never email payloads or user data. Settings
// writes and completed/failed runs invalidate it; hourly expiry is a fallback.
const nextWorkAt = unstable_cache(async () => {
  const [reminder, delivery] = await Promise.all([
    prisma.rewardReminder.aggregate({ where: { enabled: true }, _min: { nextSendAt: true } }),
    prisma.rewardDelivery.aggregate({ where: { status: { in: ["pending", "processing"] } }, _min: { nextAttemptAt: true } }),
  ]);
  const dates = [reminder._min.nextSendAt, delivery._min.nextAttemptAt].filter((value): value is Date => value !== null);
  return dates.length ? new Date(Math.min(...dates.map(value => value.getTime()))).toISOString() : null;
}, ["reward-reminder-next-work-v1"], { tags: [REWARD_REMINDER_SCHEDULE_TAG], revalidate: 3600 });

export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try {
    if (!rewardEmailConfigured()) return privateRewardResponse({ disabled: true, accepted: 0, skipped: 0, failed: 0 });
    const next = await nextWorkAt();
    if (!next || Date.parse(next) > Date.now()) {
      console.info({ event: "reward_reminder.cron_idle", nextWorkAt: next });
      return privateRewardResponse({ disabled: false, idle: true, accepted: 0, skipped: 0, failed: 0 });
    }
    try {
      const result = await runRewardReminders();
      console.info({ event: "reward_reminder.cron_run", ...result });
      return privateRewardResponse(result);
    }
    finally { revalidateTag(REWARD_REMINDER_SCHEDULE_TAG, { expire: 0 }); }
  } catch (error) { return rewardFailure(error); }
}
