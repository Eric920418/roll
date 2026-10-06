import { browserMutationGuard } from "@/lib/security/http";
import { revalidateTag } from "next/cache";
import { REWARD_REMINDER_SCHEDULE_TAG } from "@/lib/rewards/policy";
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
    revalidateTag(REWARD_REMINDER_SCHEDULE_TAG, { expire: 0 });
    return privateRewardResponse(await getRewardSummary());
  } catch (error) { return rewardFailure(error); }
}
