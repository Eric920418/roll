import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { DUPLICATE_PERIOD, kpiPointSchema } from "@/lib/investor/validation";

type Ctx = { params: Promise<{ id: string }> };

async function accountForOwner() {
  const account = await getCurrentAccount();
  if (!account) return { account: null, response: unauthorized() };
  if (!planAtLeast(getEffectivePlan(account), "business")) {
    return { account: null, response: fail("Investor Portal 需要 Business 以上方案。", 403) };
  }
  return { account, response: null };
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const access = await accountForOwner();
    if (!access.account) return access.response;
    const { id } = await params;
    const parsed = kpiPointSchema.partial().safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues.map((item) => item.message).join("\n"));

    const current = await prisma.investorKpiPoint.findFirst({
      where: { id, kpi: { portal: { userId: access.account.id } } },
      select: { kpiId: true, period: true },
    });
    if (!current) return fail("找不到指定的 KPI 數值。", 404);

    // 改期間時可能撞到 @@unique([kpiId, period])；先查出來給明確訊息，
    // 不讓 Prisma P2002 變成前端看不懂的 500。
    if (parsed.data.period && parsed.data.period !== current.period) {
      const clash = await prisma.investorKpiPoint.findUnique({
        where: { kpiId_period: { kpiId: current.kpiId, period: parsed.data.period } },
        select: { id: true },
      });
      if (clash) return fail(DUPLICATE_PERIOD, 409);
    }

    await prisma.investorKpiPoint.update({ where: { id }, data: parsed.data });
    return ok({ updated: true });
  } catch (error) {
    return failFromError(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const access = await accountForOwner();
    if (!access.account) return access.response;
    const { id } = await params;
    const result = await prisma.investorKpiPoint.deleteMany({
      where: { id, kpi: { portal: { userId: access.account.id } } },
    });
    if (!result.count) return fail("找不到指定的 KPI 數值。", 404);
    return ok({ deleted: true });
  } catch (error) {
    return failFromError(error);
  }
}
