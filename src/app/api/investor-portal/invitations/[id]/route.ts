import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await getCurrentAccount();
    if (!account) return unauthorized();
    if (!planAtLeast(getEffectivePlan(account), "business")) {
      return fail("Investor Portal 邀請管理需要 Business 以上方案。", 403);
    }
    const { id } = await context.params;
    const result = await prisma.investorInvitation.updateMany({
      where: { id, portal: { userId: account.id }, status: { not: "revoked" } },
      data: {
        status: "revoked",
        activeKey: null,
        tokenHash: null,
        revokedAt: new Date(),
      },
    });
    if (!result.count) return fail("找不到指定的投資人邀請。", 404);
    return ok({ revoked: true });
  } catch (error) {
    return failFromError(error);
  }
}
