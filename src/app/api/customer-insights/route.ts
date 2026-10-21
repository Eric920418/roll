import { type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { browserMutationGuard } from "@/lib/security/http";
import { ok, fail, failFromError, unauthorized } from "@/lib/api";
import { insightSchema, insightBody, type Insight } from "@/lib/customer-insights/schema";
import { interviewSummary } from "@/lib/customer-insights/interviews";
import { interviewRows, lockInterviewAction, refreshInterviewProgress } from "@/lib/customer-insights/service";
import { PlanWriteError, getActiveActionPlan } from "@/lib/action-plan/service";
import { planWorkspaceEvidence } from "@/lib/action-plan/workspace-service";

const create = z.object({ requestId: z.string().uuid(), insight: insightSchema }).strict();
const edit = z.object({ id: z.string().min(1), updatedAt: z.iso.datetime(), insight: insightSchema }).strict();
function errorResponse(error: unknown) {
  if (error instanceof PlanWriteError) return fail(error.message, error.status);
  if (error instanceof z.ZodError) return fail(error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  if (error instanceof SyntaxError) return fail("Invalid JSON / 無效 JSON", 400);
  return failFromError(error);
}
function noteData(insight: Insight) {
  return { title: insight.name, body: insightBody(insight), insight: insight as unknown as Prisma.InputJsonValue, meetingAt: insight.date ? new Date(`${insight.date}T00:00:00Z`) : null };
}
function sameInsight(value: unknown, insight: Insight) { return JSON.stringify(insightSchema.safeParse(value).data) === JSON.stringify(insight); }

export async function GET(req: NextRequest) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案 / Pro plan required", 403);
    const actionId = z.string().min(1).max(200).parse(req.nextUrl.searchParams.get("actionId"));
    const action = await prisma.actionItem.findFirst({ where: { id: actionId, actionPlan: { userId: session.uid } }, select: { id: true, actionPlanId: true } });
    if (!action) return fail("找不到任務 / Task not found", 404);
    if (req.nextUrl.searchParams.get("scope") === "plan") {
      const evidence = await planWorkspaceEvidence(prisma as unknown as Prisma.TransactionClient, session.uid, action.actionPlanId);
      return ok({ leads: evidence.leads, scorecards: evidence.scorecards });
    }
    const rows = await interviewRows(prisma as unknown as Prisma.TransactionClient, session.uid, actionId);
    return ok({ rows: rows.map(r => ({ ...r, updatedAt: r.updatedAt.toISOString() })), summary: interviewSummary(actionId, rows), plan: await getActiveActionPlan(session.uid) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const { requestId, insight } = create.parse(await req.json());
    if (!(await requirePlan("pro")) && !insight.journeyId) return fail("此功能需 Pro 以上方案 / Pro plan required", 403);
    if (insight.journeyId && (insight.stage !== "discover" || insight.type !== "Prospect")) return fail("此工作區只記錄潛在客戶訪談 / This workspace records prospect interviews", 400);
    if (insight.commercial?.contactId && !await prisma.contact.findFirst({ where: { id: insight.commercial.contactId, userId: session.uid }, select: { id: true } })) return fail("找不到自己的聯絡人 / Contact not found", 404);
    const id = `insight_${requestId}`;
    try {
      await prisma.$transaction(async raw => {
        const tx = raw as unknown as Prisma.TransactionClient;
        const existing = await tx.meetingNote.findUnique({ where: { id }, select: { userId: true, insight: true } });
        if (existing) {
          if (existing.userId !== session.uid || !sameInsight(existing.insight, insight)) throw new PlanWriteError("這次提交已儲存不同內容，請重新載入；輸入保留 / Submission already saved with different content; reload", 409);
          return;
        }
        if (insight.journeyId) await (await import("@/lib/discovery/service")).lockDiscoveryWrite(tx, session.uid, insight.journeyId, true);
        if (insight.actionId) await lockInterviewAction(tx, session.uid, insight.actionId, true);
        await tx.meetingNote.create({ data: { id, userId: session.uid, ...noteData(insight), meetingType: "other" } });
        if (insight.actionId) await refreshInterviewProgress(tx, session.uid, insight.actionId);
        if (insight.journeyId) await (await import("@/lib/discovery/service")).invalidateDiscovery(tx, insight.journeyId);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const retry = await prisma.meetingNote.findUnique({ where: { id }, select: { userId: true, insight: true } });
      if (retry?.userId !== session.uid || !sameInsight(retry?.insight, insight)) throw new PlanWriteError("請重新提交；輸入保留 / Start a new submission; input retained", 409);
    }
    return ok({ id, ...(insight.actionId ? { plan: await getActiveActionPlan(session.uid) } : {}) }, 201);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const input = edit.parse(await req.json());
    if (!(await requirePlan("pro")) && !input.insight.journeyId) return fail("此功能需 Pro 以上方案 / Pro plan required", 403);
    if (input.insight.journeyId && (input.insight.stage !== "discover" || input.insight.type !== "Prospect")) return fail("此工作區只記錄潛在客戶訪談 / This workspace records prospect interviews", 400);
    if (input.insight.commercial?.contactId && !await prisma.contact.findFirst({ where: { id: input.insight.commercial.contactId, userId: session.uid }, select: { id: true } })) return fail("找不到自己的聯絡人 / Contact not found", 404);
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient;
      const row = await tx.meetingNote.findFirst({ where: { id: input.id, userId: session.uid }, select: { insight: true } });
      const old = insightSchema.safeParse(row?.insight);
      if (!row || !old.success) throw new PlanWriteError("找不到對話 / Conversation not found", 404);
      if (old.data.journeyId !== input.insight.journeyId) throw new PlanWriteError("不可移除或轉移工作區關聯 / Cannot remove or transfer a workspace link", 409);
      if (input.insight.journeyId) await (await import("@/lib/discovery/service")).lockDiscoveryWrite(tx, session.uid, input.insight.journeyId);
      if (old.data.actionId && old.data.actionId !== input.insight.actionId) throw new PlanWriteError("不可移除或轉移訪談的任務關聯 / Cannot remove or transfer the interview task link", 409);
      if (input.insight.actionId) await lockInterviewAction(tx, session.uid, input.insight.actionId, !old.data.actionId);
      const updated = await tx.meetingNote.updateMany({ where: { id: input.id, userId: session.uid, updatedAt: new Date(input.updatedAt) }, data: noteData(input.insight) });
      if (!updated.count) throw new PlanWriteError("紀錄已由其他分頁更新；輸入保留，請重新載入後比對 / Conversation changed in another tab; reload and compare", 409);
      if (input.insight.actionId) await refreshInterviewProgress(tx, session.uid, input.insight.actionId);
      if (input.insight.journeyId) await (await import("@/lib/discovery/service")).invalidateDiscovery(tx, input.insight.journeyId);
    });
    return ok({ id: input.id, ...(input.insight.actionId ? { plan: await getActiveActionPlan(session.uid) } : {}) });
  } catch (error) { return errorResponse(error); }
}
