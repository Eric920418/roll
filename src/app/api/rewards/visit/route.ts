import { browserMutationGuard } from "@/lib/security/http";
import { getUserSession } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/api";
import { claimVisit, getRewardSummary } from "@/lib/rewards/service";
import { assertSameOrigin, privateRewardResponse, rewardFailure } from "@/lib/rewards/http";
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, false);
  if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    assertSameOrigin(req);
    await claimVisit(session.uid);
    return privateRewardResponse(await getRewardSummary());
  } catch (error) { return rewardFailure(error); }
}
