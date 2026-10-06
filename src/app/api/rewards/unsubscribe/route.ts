import { z } from "zod";
import { revalidateTag } from "next/cache";
import { REWARD_REMINDER_SCHEDULE_TAG } from "@/lib/rewards/policy";
import { unsubscribeReminder } from "@/lib/rewards/reminders";
import { privateRewardResponse, rewardFailure } from "@/lib/rewards/http";
export async function POST(req: Request) {
  try {
    const token = z.string().min(1).max(300).parse(new URL(req.url).searchParams.get("token"));
    await unsubscribeReminder(token);
    revalidateTag(REWARD_REMINDER_SCHEDULE_TAG, { expire: 0 });
    return privateRewardResponse({ unsubscribed: true });
  } catch (error) { return rewardFailure(error); }
}
