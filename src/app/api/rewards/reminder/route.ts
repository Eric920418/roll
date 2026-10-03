import { browserMutationGuard } from "@/lib/security/http";
import { getUserSession } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/api";
import { getRewardSummary } from "@/lib/rewards/service";
import { reminderSchema, saveReminder } from "@/lib/rewards/reminders";
import { assertSameOrigin, privateRewardResponse, rewardFailure } from "@/lib/rewards/http";
export async function PATCH(req: Request) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    assertSameOrigin(req);
    await saveReminder(session.uid, reminderSchema.parse(await req.json()));
    return privateRewardResponse(await getRewardSummary());
  } catch (error) { return rewardFailure(error); }
}
