import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import {
  fortnightIndex,
  selectForPeriod,
  scoreAttempt,
  type AttemptAnswer,
} from "@/lib/playbook/quiz";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";

import { awardReward, rewardTransaction, lockRewardAccount } from "@/lib/rewards/service";
import { validQuizAnswers } from "@/lib/rewards/policy";

// 送出本期雙週問答。server 端以會員註冊日重算 periodIndex（不信前端）→ 挑同一批題 → 計分 → 每期存一筆。
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { createdAt: true },
    });
    if (!user) return unauthorized();

    const body = await req.json();
    const answers: AttemptAnswer[] = Array.isArray(body?.answers)
      ? body.answers
          .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === "object")
          .map((a: Record<string, unknown>) => ({
            questionId: String(a.questionId ?? ""),
            choice: Number(a.choice),
          }))
      : [];

    const periodIndex = fortnightIndex(user.createdAt, new Date());
    const selected = selectForPeriod(periodIndex);
    if (selected.length === 0) return fail("目前沒有可作答的題目", 409);

    const enrich = (
      results: ReturnType<typeof scoreAttempt>["results"],
    ) =>
      results.map((r) => ({
        ...r,
        explanation: selected.find((s) => s.id === r.questionId)?.explanation ?? null,
      }));

    // 每期一筆：已作答則回原成績（用儲存的答案重算對錯/解析），不覆寫。
    const existing = await prisma.playbookQuizAttempt.findUnique({
      where: { userId_periodIndex: { userId: session.uid, periodIndex } },
    });
    if (existing) {
      const stored = (existing.answers as AttemptAnswer[] | null) ?? [];
      const scored = scoreAttempt(selected, stored);
      return ok({
        alreadyDone: true,
        score: existing.score,
        total: existing.total,
        results: enrich(scored.results),
      });
    }

    if (!validQuizAnswers(selected, answers)) return fail("請完整回答本期每一題，答案不可重複或超出選項 / Answer every question once with a valid option", 400);
    const result = scoreAttempt(selected, answers);
    const saved = await rewardTransaction(async tx => {
      await lockRewardAccount(tx, session.uid);
      const replay = await tx.playbookQuizAttempt.findUnique({ where: { userId_periodIndex: { userId: session.uid, periodIndex } } });
      if (replay) return { attempt: replay, replay: true };
      const attempt = await tx.playbookQuizAttempt.create({ data: {
        userId: session.uid, periodIndex, answers: answers as unknown as object[], score: result.score, total: result.total,
      } });
      await awardReward(tx, session.uid, "quiz", String(periodIndex));
      return { attempt, replay: false };
    });
    const scored = scoreAttempt(selected, saved.attempt.answers as unknown as AttemptAnswer[]);
    return ok({ alreadyDone: saved.replay, score: saved.attempt.score, total: saved.attempt.total, results: enrich(scored.results) });
  } catch (error) {
    return failFromError(error);
  }
}
