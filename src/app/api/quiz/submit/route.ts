import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { scoreAnswers, matchFounder, type Answer } from "@/lib/quiz/match";

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const raw = Array.isArray(body?.answers) ? body.answers : [];
    const answers: Answer[] = raw
      .filter(
        (a: unknown): a is Answer =>
          !!a &&
          typeof (a as Answer).questionId === "string" &&
          ((a as Answer).choice === "A" || (a as Answer).choice === "B"),
      )
      .map((a: Answer) => ({ questionId: a.questionId, choice: a.choice }));

    if (answers.length === 0) return fail("缺少作答內容", 400);

    // 重新從 DB 取題目（不信任前端的分數）
    const questions = await prisma.quizQuestion.findMany({
      where: { published: true },
    });
    const scorable = questions.map((q) => {
      const a = (q.optionA ?? {}) as { value?: number };
      const b = (q.optionB ?? {}) as { value?: number };
      return {
        id: q.id,
        dimension: q.dimension,
        optionA: { value: Number(a.value ?? 50) },
        optionB: { value: Number(b.value ?? 50) },
      };
    });

    const scores = scoreAnswers(scorable, answers);

    const founders = await prisma.founder.findMany({
      where: { published: true },
    });
    const matched = matchFounder(scores, founders);

    await prisma.quizSubmission.create({
      data: {
        userId: session.uid,
        founderId: matched?.id ?? null,
        answers,
        scores,
      },
    });

    await prisma.user.update({
      where: { id: session.uid },
      data: { quizCompleted: true, completed: true },
    });

    return ok({ founderSlug: matched?.slug ?? null });
  } catch (error) {
    return failFromError(error);
  }
}
