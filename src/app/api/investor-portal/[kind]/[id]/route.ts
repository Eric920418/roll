import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { kpiSchema, milestoneSchema, updateSchema } from "@/lib/investor/validation";

const schemas = { kpi: kpiSchema.partial(), milestone: milestoneSchema.partial(), update: updateSchema.partial() };

async function accountForOwner() {
  const account = await getCurrentAccount();
  if (!account) return { account: null, response: unauthorized() };
  if (!planAtLeast(getEffectivePlan(account), "business")) {
    return { account: null, response: fail("Investor Portal 需要 Business 以上方案。", 403) };
  }
  return { account, response: null };
}

export async function PATCH(req: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const access = await accountForOwner();
    if (!access.account) return access.response;
    const { kind, id } = await context.params;
    if (!(kind in schemas)) return fail("找不到指定的 Investor Portal 項目。", 404);
    const parsed = schemas[kind as keyof typeof schemas].safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues.map((item) => item.message).join("\n"));
    const where = { id, portal: { userId: access.account.id } };
    const data = {
      ...parsed.data,
      ...("targetDate" in parsed.data
        ? { targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null }
        : {}),
      ...("publishedAt" in parsed.data
        ? { publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : undefined }
        : {}),
    };
    const result =
      kind === "kpi"
        ? await prisma.investorKpi.updateMany({ where, data })
        : kind === "milestone"
          ? await prisma.investorMilestone.updateMany({ where, data })
          : await prisma.investorUpdate.updateMany({ where, data });
    if (!result.count) return fail("找不到指定的 Investor Portal 項目。", 404);
    return ok({ updated: true });
  } catch (error) {
    return failFromError(error);
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const access = await accountForOwner();
    if (!access.account) return access.response;
    const { kind, id } = await context.params;
    const where = { id, portal: { userId: access.account.id } };
    const result =
      kind === "kpi"
        ? await prisma.investorKpi.deleteMany({ where })
        : kind === "milestone"
          ? await prisma.investorMilestone.deleteMany({ where })
          : kind === "update"
            ? await prisma.investorUpdate.deleteMany({ where })
            : null;
    if (!result?.count) return fail("找不到指定的 Investor Portal 項目。", 404);
    return ok({ deleted: true });
  } catch (error) {
    return failFromError(error);
  }
}
