import { browserMutationGuard } from "@/lib/security/http";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { lockInterviewAction, refreshInterviewProgress } from "@/lib/customer-insights/service";
import { insightSchema } from "@/lib/customer-insights/schema";
import { PlanWriteError } from "@/lib/action-plan/service";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import {
  noteUpdateSchema,
  zodMessage,
  nullifyEmpty,
  parseDate,
} from "@/lib/dashboard/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;

    const parsed = noteUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;
    const existing = await prisma.meetingNote.findFirst({ where: { id, userId: session.uid }, select: { insight: true } });
    if (!existing) return fail("找不到資料 / Not found", 404);
    if (existing.insight != null) return fail("請使用 Customer insights 的編輯對話，避免覆蓋結構化紀錄。 / Edit this conversation in Customer insights to preserve structured fields.", 409);

    const data = {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.body !== undefined && { body: nullifyEmpty(d.body) }),
      ...(d.meetingAt !== undefined && { meetingAt: parseDate(d.meetingAt) }),
      ...(d.meetingType !== undefined && { meetingType: d.meetingType }),
    };

    const res = await prisma.meetingNote.updateMany({
      where: { id, userId: session.uid },
      data,
    });
    if (res.count === 0) return fail("找不到資料", 404);
    return ok({ updated: true });
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    return failFromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const blocked = browserMutationGuard(_req, false);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;

    await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      const row = await tx.meetingNote.findFirst({ where: { id, userId: session.uid }, select: { insight: true, updatedAt: true } });
      if (!row) throw new PlanWriteError("找不到資料 / Not found", 404);
      const version = new URL(_req.url).searchParams.get("updatedAt");
      if (row.insight != null && !version) throw new PlanWriteError("請重新載入訪談紀錄後刪除 / Reload the conversation before deleting", 409);
      if (version && !z.iso.datetime().safeParse(version).success) throw new PlanWriteError("無效紀錄版本 / Invalid conversation version", 400);
      if (version && row.updatedAt.toISOString() !== version) throw new PlanWriteError("紀錄已更新，請重新載入後比對再刪除 / Conversation changed; reload and compare before deleting", 409);
      const actionId = insightSchema.safeParse(row.insight).data?.actionId;
      if (actionId) await lockInterviewAction(tx, session.uid, actionId);
      const deleted = await tx.meetingNote.deleteMany({ where: { id, userId: session.uid, updatedAt: row.updatedAt } });
      if (!deleted.count) throw new PlanWriteError("紀錄已更新，請重新載入 / Conversation changed; reload", 409);
      if (actionId) await refreshInterviewProgress(tx, session.uid, actionId);
    });
    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    return failFromError(error);
  }
}
