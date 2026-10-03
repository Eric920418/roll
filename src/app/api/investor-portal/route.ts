import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import {
  getOrCreateOwnerPortal,
  ownerPortalDto,
  portalInclude,
} from "@/lib/investor/portal";
import { canEditFieldVisibility, FIELD_VISIBILITY_FORBIDDEN } from "@/lib/investor/fields";
import {
  createPortalItemSchema,
  fieldVisibilitySchema,
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
    if (error instanceof Error && error.message === "weekly-publication-conflict") return fail("私人草稿已更新，請重新載入 / Private draft changed; reload", 409);
    return failFromError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const access = await owner();
    if (!access.account) return access.response;

    const body = await req.json();
    const parsed = portalSettingsSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues.map((item) => item.message).join("\n"));

    // hiddenFields 只在請求真的帶了它時才驗、才檢查方案。
    // 沒帶就完全不碰該欄位 —— Business 用戶儲存 section 開關時不會被誤擋，
    // 也不會把既有（Enterprise 時期設定的）隱藏清單清空。
    let hiddenFields: string[] | undefined;
    if (body != null && typeof body === "object" && "hiddenFields" in body) {
      if (!canEditFieldVisibility(getEffectivePlan(access.account))) {
        return fail(FIELD_VISIBILITY_FORBIDDEN, 403);
      }
      const visibility = fieldVisibilitySchema.safeParse(body);
      if (!visibility.success) {
        return fail(visibility.error.issues.map((item) => item.message).join("\n"));
      }
      hiddenFields = visibility.data.hiddenFields;
    }

    await getOrCreateOwnerPortal(access.account.id);
    const portal = await prisma.investorPortal.update({
      where: { userId: access.account.id },
      data: {
        ...parsed.data,
        ...(hiddenFields !== undefined && { hiddenFields }),
      },
      include: portalInclude,
    });
    return ok(ownerPortalDto(portal));
  } catch (error) {
    if (error instanceof Error && error.message === "weekly-publication-conflict") return fail("私人草稿已更新，請重新載入 / Private draft changed; reload", 409);
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
    if (parsed.data.sourceCheckInId) {
      if (!parsed.data.confirmed || parsed.data.sourceRevision == null) return fail("請確認發布週報草稿 / Confirm publication of the weekly draft", 400);
      const source = await prisma.weeklyCheckIn.findFirst({ where: { id: parsed.data.sourceCheckInId, userId: access.account.id }, select: { id: true, revision: true, investorDraft: true } });
      if (!source) return fail("找不到私人週報 / Private check-in not found", 404);
      const previous = await prisma.investorUpdate.findUnique({ where: { sourceCheckInId: source.id } });
      if (previous) return previous.portalId === portal.id ? ok(previous) : fail("找不到更新 / Update not found", 404);
      if (source.revision !== parsed.data.sourceRevision || !source.investorDraft) return fail("私人草稿已更新，請重新載入後確認 / Private draft changed; reload before publishing", 409);
      // Unique source prevents double publication. Transfer alone never calls this write.
      const published = await prisma.$transaction(async raw => {
        const tx = raw;
        const locked = await tx.weeklyCheckIn.updateMany({ where: { id: source.id, userId: access.account.id, revision: source.revision }, data: { revision: source.revision } });
        if (!locked.count) throw new Error("weekly-publication-conflict");
        return tx.investorUpdate.upsert({ where: { sourceCheckInId: source.id }, update: {}, create: { portalId: portal.id, sourceCheckInId: source.id, ...data, publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date() } });
      });
      return ok(published, 201);
    }
    return ok(await prisma.investorUpdate.create({
      data: {
        portalId: portal.id,
        ...data,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
      },
    }), 201);
  } catch (error) {
    if (error instanceof Error && error.message === "weekly-publication-conflict") return fail("私人草稿已更新，請重新載入 / Private draft changed; reload", 409);
    return failFromError(error);
  }
}
