import { z } from "zod";
import { unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { redeemReward, getRewardSummary, RewardError } from "@/lib/rewards/service";
import { assertSameOrigin, privateRewardResponse, rewardFailure } from "@/lib/rewards/http";
const schema = z.object({ requestId: z.string().uuid() }).strict();
export async function POST(req: Request) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    assertSameOrigin(req);
    const input = schema.parse(await req.json());
    if (!(await checkRateLimit(`rewards:redeem:${session.uid}`, 10, MINUTE_MS, false)).ok) throw new RewardError("兌換請求過於頻繁，請稍後重試 / Too many redemption requests", 429, "rate_limit");
    const redemption = await redeemReward(session.uid, input.requestId);
    return privateRewardResponse({ redemption: { id: redemption.id, credits: redemption.credits }, summary: await getRewardSummary() });
  } catch (error) { return rewardFailure(error); }
}
