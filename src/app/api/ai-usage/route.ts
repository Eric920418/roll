import { requirePlan } from "@/lib/billing/gate";
import { getAiUsageSummary } from "@/lib/ai/allowance";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";

export async function GET() {
  try {
    if (!(await getUserSession())) return unauthorized();
    const account = await requirePlan("pro");
    if (!account) return fail("NOVA 額度僅提供給 Pro 以上方案或有效試用帳號。", 403);
    const summary = await getAiUsageSummary(account);
    if (!summary) return fail("目前沒有可用的 NOVA 額度週期。", 403);
    return ok(summary);
  } catch (error) {
    return failFromError(error);
  }
}
