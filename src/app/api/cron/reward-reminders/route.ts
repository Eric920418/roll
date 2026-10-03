import { timingSafeEqual } from "node:crypto";
import { runRewardReminders } from "@/lib/rewards/reminders";
import { privateRewardResponse, rewardFailure } from "@/lib/rewards/http";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try { return privateRewardResponse(await runRewardReminders()); } catch (error) { return rewardFailure(error); }
}
