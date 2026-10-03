import { z } from "zod";
import { getRewardSummary } from "@/lib/rewards/service";
import { privateRewardResponse, rewardFailure } from "@/lib/rewards/http";
export async function GET(req: Request) {
  try {
    const query = new URL(req.url).searchParams;
    const cursor = z.string().cuid().optional().parse(query.get("cursor") ?? undefined);
    const requestId = z.string().uuid().optional().parse(query.get("redemptionRequestId") ?? undefined);
    return privateRewardResponse(await getRewardSummary(cursor, requestId));
  } catch (error) { return rewardFailure(error); }
}
