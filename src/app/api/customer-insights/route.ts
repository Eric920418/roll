import { type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { browserMutationGuard } from "@/lib/security/http";
import { ok, fail, failFromError, unauthorized } from "@/lib/api";
import { insightSchema, insightBody } from "@/lib/customer-insights/schema";
const create = z.object({ requestId: z.string().uuid(), insight: insightSchema }).strict();
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案 / Pro plan required", 403);
    const { requestId, insight } = create.parse(await req.json());
    // A retry reuses an opaque per-submission ID; other members cannot retrieve its contents.
    const id = `insight_${requestId}`;
    const existing = await prisma.meetingNote.findUnique({ where: { id }, select: { id: true, userId: true, insight: true } });
    if (existing) return existing.userId === session.uid && JSON.stringify(insightSchema.safeParse(existing.insight).data) === JSON.stringify(insight) ? ok({ id }) : fail("這次提交已使用不同內容儲存，請重新載入確認紀錄。輸入仍保留。 / This submission was saved with different content. Reload to review it; your input is retained.", 409);
    try { await prisma.meetingNote.create({ data: { id, userId: session.uid, title: insight.name, body: insightBody(insight), insight: insight as unknown as Prisma.InputJsonValue, meetingAt: insight.date ? new Date(`${insight.date}T00:00:00Z`) : null, meetingType: "other" } }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error; const retry = await prisma.meetingNote.findUnique({ where: { id }, select: { userId: true, insight: true } }); if (retry?.userId !== session.uid || JSON.stringify(insightSchema.safeParse(retry?.insight).data) !== JSON.stringify(insight)) return fail("請重新提交 / Please start a new submission", 409); }
    return ok({ id }, 201);
  } catch (error) { if (error instanceof z.ZodError) return fail(error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400); if (error instanceof SyntaxError) return fail("Invalid JSON / 無效 JSON", 400); return failFromError(error); }
}

const edit = z.object({ id: z.string().min(1), updatedAt: z.iso.datetime(), insight: insightSchema }).strict();
export async function PATCH(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案 / Pro plan required", 403);
    const input = edit.parse(await req.json());
    const existing = await prisma.meetingNote.findFirst({ where: { id: input.id, userId: session.uid }, select: { insight: true } });
    if (!existing || !insightSchema.safeParse(existing.insight).success) return fail("找不到對話 / Conversation not found", 404);
    const { insight } = input;
    const updated = await prisma.meetingNote.updateMany({ where: { id: input.id, userId: session.uid, updatedAt: new Date(input.updatedAt) }, data: { title: insight.name, body: insightBody(insight), insight: insight as unknown as Prisma.InputJsonValue, meetingAt: insight.date ? new Date(`${insight.date}T00:00:00Z`) : null } });
    if (!updated.count) return fail("紀錄已由其他分頁更新；輸入保留，請重新載入後比對。 / Conversation changed in another tab. Input retained; reload to compare.", 409);
    return ok({ id: input.id });
  } catch (error) { if (error instanceof z.ZodError) return fail(error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400); if (error instanceof SyntaxError) return fail("Invalid JSON / 無效 JSON", 400); return failFromError(error); }
}
