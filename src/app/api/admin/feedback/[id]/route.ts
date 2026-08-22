import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import {
  feedbackAdminUpdateSchema,
  zodMessage,
  nullifyEmpty,
} from "@/lib/dashboard/schemas";
import { isTerminalStatus } from "@/lib/dashboard/feedback";

// 後台：處理會員回報（改狀態 / 寫回覆）。
// proxy 已擋 /api/admin/*，此處 requireAdmin() 為二次確認（DAL 層防禦）。
// 只允許動 status / adminReply —— 會員填寫的內容維持唯讀。

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    const parsed = feedbackAdminUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    const current = await prisma.feedbackReport.findUnique({
      where: { id },
      select: { status: true, resolvedAt: true },
    });
    if (!current) return fail("找不到這則回報", 404);

    // resolvedAt = 首次進入終局狀態的時間；被重新打開（回到 open/in_progress）就清掉，
    // 讓「處理時長」永遠對應目前這一輪，不會被舊的關閉時間污染。
    let resolvedAt: Date | null | undefined;
    if (d.status !== undefined && d.status !== current.status) {
      resolvedAt = isTerminalStatus(d.status)
        ? (current.resolvedAt ?? new Date())
        : null;
    }

    const updated = await prisma.feedbackReport.update({
      where: { id },
      data: {
        ...(d.status !== undefined && { status: d.status }),
        ...(d.adminReply !== undefined && {
          adminReply: nullifyEmpty(d.adminReply),
        }),
        ...(resolvedAt !== undefined && { resolvedAt }),
      },
      select: { id: true, status: true, adminReply: true, resolvedAt: true },
    });
    return ok(updated);
  } catch (error) {
    return failFromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    const res = await prisma.feedbackReport.deleteMany({ where: { id } });
    if (res.count === 0) return fail("找不到這則回報", 404);
    return ok({ deleted: id });
  } catch (error) {
    return failFromError(error);
  }
}
