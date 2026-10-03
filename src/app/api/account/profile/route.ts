import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { profilePatchSchema } from "@/lib/icp/schema";

import { awardProfile, rewardTransaction } from "@/lib/rewards/service";

// Field presence means update; omission means preserve. ICP belongs to /api/account/icp.
export async function PATCH(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const body = await req.json();
    const parsed = profilePatchSchema.safeParse(body?.data);
    if (!parsed.success) return fail(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
    if (!Object.keys(parsed.data).length) return fail("沒有可更新的欄位 / No profile fields supplied", 400);
    await rewardTransaction(async tx => {
    await tx.onboardingProfile.upsert({
      where: { userId: session.uid }, create: { userId: session.uid, targetMarkets: [], needs: [], ...parsed.data }, update: parsed.data,
    });
    await awardProfile(tx, session.uid);
    });
    return ok({ saved: true });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof Error && error.message === "Website must use HTTP or HTTPS") return fail("無效的 JSON 或網站網址 / Invalid JSON or website URL", 400);
    return failFromError(error);
  }
}
