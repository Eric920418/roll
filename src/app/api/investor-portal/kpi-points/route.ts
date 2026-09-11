import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { createKpiPointSchema, DUPLICATE_PERIOD } from "@/lib/investor/validation";

// KPI 的時間序列數值點。這是「資料」不是「隱藏設定」，
// 所以維持 Business 閘門，不需要 Enterprise。

async function accountForOwner() {
  const account = await getCurrentAccount();
  if (!account) return { account: null, response: unauthorized() };
  if (!planAtLeast(getEffectivePlan(account), "business")) {
    return { account: null, response: fail("Investor Portal 需要 Business 以上方案。", 403) };
  }
  return { account, response: null };
}

export async function POST(req: Request) {
  try {
    const access = await accountForOwner();
    if (!access.account) return access.response;
    const parsed = createKpiPointSchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues.map((item) => item.message).join("\n"));
    const { kpiId, ...data } = parsed.data;

    // proxy.ts 不擋 /api/*，每個 route 自行用 session.uid 收斂範圍。
    const owned = await prisma.investorKpi.findFirst({
      where: { id: kpiId, portal: { userId: access.account.id } },
      select: { id: true },
    });
    if (!owned) return fail("找不到指定的 KPI。", 404);

    const existing = await prisma.investorKpiPoint.findUnique({
      where: { kpiId_period: { kpiId, period: data.period } },
      select: { id: true },
    });
    if (existing) return fail(DUPLICATE_PERIOD, 409);

    return ok(await prisma.investorKpiPoint.create({ data: { kpiId, ...data } }), 201);
  } catch (error) {
    return failFromError(error);
  }
}
