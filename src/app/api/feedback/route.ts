import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { feedbackCreateSchema, zodMessage } from "@/lib/dashboard/schemas";
import { trialWindow, trialSubmissionSchema } from "@/lib/dashboard/next-steps";
import {
  FEEDBACK_LIMIT_PER_DAY,
  FEEDBACK_WINDOW_MS,
} from "@/lib/dashboard/feedback";

const trialSelect = { trialPlan: true, trialStartsAt: true, trialEndsAt: true } as const;
export async function GET() {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const user = await prisma.user.findUnique({ where: { id: session.uid }, select: trialSelect });
    if (!user) return unauthorized();
    const trial = trialWindow(user);
    const report = trial ? await prisma.feedbackReport.findUnique({ where: { trialKey: `${session.uid}:${trial.startsAt}` }, select: { id: true } }) : null;
    return ok({ trial, submitted: Boolean(report) });
  } catch (error) { return failFromError(error); }
}

// 問題回報 — 會員送出。
//
// 刻意「不」呼叫 requirePlan()：其他會員工具（CRM / pipeline / notes）是 Pro 限定，
// 但 bug/建議是我們想要更多、不是更少的訊號，把免費會員擋在付費牆後面等於自斷回饋來源。
// 濫用防護改由 rate limit 承擔（每會員每日上限）。
//
// 送出後不開放會員自行修改/刪除：回報是給我們重現問題的事證，且管理員可能已據此回覆，
// 事後被改寫會讓後台的處理紀錄失去意義。要補充內容就再送一則。
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const rl = await checkRateLimit(
      `feedback:${session.uid}`,
      FEEDBACK_LIMIT_PER_DAY,
      FEEDBACK_WINDOW_MS,
    );
    if (!rl.ok) {
      return fail(
        `今日回報已達 ${FEEDBACK_LIMIT_PER_DAY} 則上限，請明天再試，或直接聯絡我們。`,
        429,
      );
    }

    const body = await req.json();
    if (body?.action === "trialSurvey") {
      const parsed = trialSubmissionSchema.safeParse(body);
      if (!parsed.success) return fail(zodMessage(parsed.error), 400);
      const d = parsed.data;
      const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.uid} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: session.uid }, select: trialSelect });
        const trial = user && trialWindow(user);
        if (!trial || trial.startsAt !== d.startsAt) return null;
        const trialKey = `${session.uid}:${trial.startsAt}`;
        const existing = await tx.feedbackReport.findUnique({ where: { trialKey }, select: { id: true, createdAt: true } });
        if (existing) return existing;
        if (!trial.due) return null;
        const a = d.answers;
        return tx.feedbackReport.create({ data: { userId: session.uid, type: "other", title: "NOVA trial feedback",
          body: `1. Goal: ${a.goal}\nWhy: ${a.motivation}\n\n2. First step: ${a.firstStep}\n\n3. Continue using NOVA: ${a.continueUsing}\nReason: ${a.reason}\nUsage: ${a.usage || "—"}\n\n4. Biggest pain point: ${a.painPoint}\n\n5. Indispensable: ${a.indispensable}`,
          surveyAnswers: { version: 1, startsAt: trial.startsAt, endsAt: trial.endsAt, answers: a }, trialKey,
          pageUrl: "/dashboard/agenda", locale: d.locale, userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
        }, select: { id: true, createdAt: true } });
      });
      return result ? ok(result) : fail("試用未滿 7 天或試用設定已變更，請重新載入 / Trial not yet seven days old or settings changed; reload", 409);
    }

    const parsed = feedbackCreateSchema.safeParse(body);
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    // userAgent 由 server 從 header 取（不信 client 傳入），截斷避免異常長 header 灌爆欄位
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) || null;

    const row = await prisma.feedbackReport.create({
      data: {
        userId: session.uid,
        type: d.type,
        title: d.title,
        body: d.body,
        pageUrl: d.pageUrl || null,
        locale: d.locale || null,
        userAgent,
      },
      select: { id: true, createdAt: true },
    });
    return ok(row, 201);
  } catch (error) {
    return failFromError(error);
  }
}
