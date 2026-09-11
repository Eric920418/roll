import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import {
  getOrCreateOwnerPortal,
  ownerPortalDto,
} from "@/lib/investor/portal";
import {
  createPortalItemSchema,
  portalSettingsSchema,
} from "@/lib/investor/validation";

async function owner() {
  const account = await getCurrentAccount();
  if (!account) return { account: null, response: unauthorized() };
  if (!planAtLeast(getEffectivePlan(account), "business")) {
    return {
      account: null,
      response: fail("Investor Portal 僅供 Business、Enterprise 或 Business 試用方案使用。", 403),
    };
  }
  return { account, response: null };
}

export async function GET() {
  try {
    const access = await owner();
    if (!access.account) return access.response;
    return ok(ownerPortalDto(await getOrCreateOwnerPortal(access.account.id)));
  } catch (error) {
    return failFromError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const access = await owner();
    if (!access.account) return access.response;
    const parsed = portalSettingsSchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues.map((item) => item.message).join("\n"));
    await getOrCreateOwnerPortal(access.account.id);
    const portal = await prisma.investorPortal.update({
      where: { userId: access.account.id },
      data: parsed.data,
      include: {
        kpis: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        milestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        updates: { orderBy: { publishedAt: "desc" } },
        invitations: { orderBy: { createdAt: "desc" } },
      },
    });
    return ok(ownerPortalDto(portal));
  } catch (error) {
    return failFromError(error);
  }
}

export async function POST(req: Request) {
  try {
    const access = await owner();
    if (!access.account) return access.response;
    const parsed = createPortalItemSchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues.map((item) => item.message).join("\n"));
    const portal = await getOrCreateOwnerPortal(access.account.id);
    const { kind, data } = parsed.data;
    if (kind === "kpi") {
      return ok(await prisma.investorKpi.create({ data: { portalId: portal.id, ...data } }), 201);
    }
    if (kind === "milestone") {
      return ok(await prisma.investorMilestone.create({
        data: {
          portalId: portal.id,
          ...data,
          targetDate: data.targetDate ? new Date(data.targetDate) : null,
        },
      }), 201);
    }
    return ok(await prisma.investorUpdate.create({
      data: {
        portalId: portal.id,
        ...data,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
      },
    }), 201);
  } catch (error) {
    return failFromError(error);
  }
}
