import { del, get } from "@vercel/blob";
import { getCurrentAccount } from "@/lib/auth/account";
import { getUserSession } from "@/lib/auth/guard";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getOrCreateOwnerPortal, ownerHasInvestorAccess } from "@/lib/investor/portal";
import { validateInvestorPdf } from "@/lib/investor/pdf";

function token() {
  const value = process.env.INVESTOR_BLOB_READ_WRITE_TOKEN;
  if (!value) throw new Error("Investor Business Plan 尚未設定 Private Blob store。");
  if (value === process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Investor Business Plan 必須使用獨立的 Private Blob store，不能沿用公開圖片 store。");
  }
  return value;
}

async function ownerPortal() {
  const account = await getCurrentAccount();
  if (!account) return { portal: null, response: unauthorized() };
  if (!planAtLeast(getEffectivePlan(account), "business")) {
    return { portal: null, response: fail("Business Plan 管理需要 Business 以上方案。", 403) };
  }
  return { portal: await getOrCreateOwnerPortal(account.id), response: null };
}

export async function POST(req: Request) {
  let uploadedPath: string | null = null;
  try {
    const access = await ownerPortal();
    if (!access.portal) return access.response;
    const body = await req.json();
    const pathname = typeof body.pathname === "string" ? body.pathname : "";
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    if (!pathname.startsWith(`investor-business-plans/${access.portal.id}/`)) {
      return fail("Business Plan 上傳資料無效。", 400);
    }
    uploadedPath = pathname;
    if (!filename) {
      await del(pathname, { token: token() });
      uploadedPath = null;
      return fail("Business Plan 檔名不可空白。", 400);
    }
    const source = await get(pathname, {
      access: "private",
      useCache: false,
      token: token(),
    });
    if (!source || source.statusCode !== 200) return fail("找不到剛上傳的 Private Blob。", 404);
    const reader = source.stream.getReader();
    let header = "";
    while (header.length < 5) {
      const chunk = await reader.read();
      if (chunk.done) break;
      header += new TextDecoder().decode(chunk.value, { stream: true });
    }
    await reader.cancel();
    const validationError = validateInvestorPdf({
      name: filename,
      type: source.blob.contentType,
      size: source.blob.size,
      header: header.slice(0, 5),
    });
    if (validationError) {
      await del(pathname, { token: token() });
      uploadedPath = null;
      return fail(validationError, 400);
    }
    const previous = {
      path: access.portal.businessPlanPath,
      filename: access.portal.businessPlanFilename,
      mime: access.portal.businessPlanMime,
      size: access.portal.businessPlanSize,
      uploadedAt: access.portal.businessPlanUploadedAt,
    };
    await prisma.investorPortal.update({
      where: { id: access.portal.id },
      data: {
        businessPlanPath: pathname,
        businessPlanFilename: filename,
        businessPlanMime: source.blob.contentType,
        businessPlanSize: source.blob.size,
        businessPlanUploadedAt: new Date(),
      },
    });
    if (previous.path) {
      try {
        await del(previous.path, { token: token() });
      } catch (error) {
        await prisma.investorPortal.update({
          where: { id: access.portal.id },
          data: {
            businessPlanPath: previous.path,
            businessPlanFilename: previous.filename,
            businessPlanMime: previous.mime,
            businessPlanSize: previous.size,
            businessPlanUploadedAt: previous.uploadedAt,
          },
        });
        await del(pathname, { token: token() }).catch(() => undefined);
        throw error;
      }
    }
    uploadedPath = null;
    return ok({ filename, size: source.blob.size }, 201);
  } catch (error) {
    if (uploadedPath) await del(uploadedPath, { token: process.env.INVESTOR_BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    return failFromError(error);
  }
}

export async function DELETE() {
  try {
    const access = await ownerPortal();
    if (!access.portal) return access.response;
    const pathname = access.portal.businessPlanPath;
    if (!pathname) return fail("目前沒有 Business Plan PDF。", 404);
    await del(pathname, { token: token() });
    await prisma.investorPortal.update({
      where: { id: access.portal.id },
      data: {
        businessPlanPath: null,
        businessPlanFilename: null,
        businessPlanMime: null,
        businessPlanSize: null,
        businessPlanUploadedAt: null,
        shareBusinessPlan: false,
      },
    });
    return ok({ deleted: true });
  } catch (error) {
    return failFromError(error);
  }
}

export async function GET(req: Request) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const portalId = new URL(req.url).searchParams.get("portalId");
    const portal = portalId
      ? (await prisma.investorInvitation.findFirst({
          where: { portalId, acceptedByUserId: session.uid, status: "accepted" },
          include: { portal: { include: { user: true } } },
        }))?.portal
      : await prisma.investorPortal.findUnique({
          where: { userId: session.uid },
          include: { user: true },
        });
    if (!portal || !ownerHasInvestorAccess(portal.user)) return fail("找不到 Business Plan。", 404);
    const isOwner = portal.userId === session.uid;
    if ((!isOwner && !portal.shareBusinessPlan) || !portal.businessPlanPath) {
      return fail("找不到 Business Plan。", 404);
    }
    const result = await get(portal.businessPlanPath, {
      access: "private",
      useCache: false,
      token: token(),
    });
    if (!result || result.statusCode !== 200) return fail("找不到 Business Plan 檔案。", 404);
    const filename = (portal.businessPlanFilename || "business-plan.pdf").replace(/[\r\n"]/g, "_");
    return new Response(result.stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failFromError(error);
  }
}
