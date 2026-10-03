import { getCurrentAccount } from "@/lib/auth/account";
import { getAiUsageSummary } from "@/lib/ai/allowance";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";

export async function GET() {
  try {
    if (!(await getUserSession())) return unauthorized();
    const account = await getCurrentAccount();
    if (!account) return unauthorized();
    const summary = await getAiUsageSummary(account);
    if (!summary) return fail("目前沒有可用的 NOVA 額度週期。", 403);
    return ok(summary);
  } catch (error) {
    return failFromError(error);
  }
}
