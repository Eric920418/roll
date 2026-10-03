import { z } from "zod";
import { unsubscribeReminder } from "@/lib/rewards/reminders";
import { privateRewardResponse, rewardFailure } from "@/lib/rewards/http";
export async function POST(req: Request) {
  try {
    const token = z.string().min(1).max(300).parse(new URL(req.url).searchParams.get("token"));
    await unsubscribeReminder(token);
    return privateRewardResponse({ unsubscribed: true });
  } catch (error) { return rewardFailure(error); }
}
