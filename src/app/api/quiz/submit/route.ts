import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import {
  scoreAnswers,
  matchFounder,
  type Answer,
  type Choice,
  type Scores,
  type ScorableQuestion,
} from "@/lib/quiz/match";
import { GROWTH_DIMENSIONS, type GrowthProfile } from "@/lib/quiz/growth";

const CHOICES: Choice[] = ["A", "B", "C", "D"];
const NEUTRAL: Scores = {
  planningDepth: 50,
  executionStrength: 50,
  visionClarity: 50,
};

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 50;

/**
 * 把選項 JSON 正規化成三維向量。
 * 新格式：{ scores:{planningDepth,executionStrength,visionClarity} }。
 * 舊格式相容：{ value:number } → 套在題目的 dimension 軸上，其餘維度中性 50。
 */
function optionScores(opt: unknown, dimension: string): Scores {
  const o = (opt ?? {}) as Record<string, unknown>;
  const s = o.scores as Partial<Scores> | undefined;
  if (s && typeof s === "object") {
    return {
      planningDepth: num(s.planningDepth),
      executionStrength: num(s.executionStrength),
      visionClarity: num(s.visionClarity),
    };
  }
  if (typeof o.value === "number") {
    const key: keyof Scores =
      dimension === "execution"
        ? "executionStrength"
        : dimension === "vision"
          ? "visionClarity"
          : "planningDepth";
    return { ...NEUTRAL, [key]: o.value };
  }
  return { ...NEUTRAL };
}

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
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
          CHOICES.includes((a as Answer).choice),
      )
      .map((a: Answer) => ({ questionId: a.questionId, choice: a.choice }));

    if (answers.length === 0) return fail("缺少作答內容", 400);

    // 重新從 DB 取題目（不信任前端的分數）
    const questions = await prisma.quizQuestion.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
    });
    if (questions.some((q) => q.dimension.startsWith("growth-"))) {
      if (questions.length !== 3 || questions.some((q, i) => q.dimension !== GROWTH_DIMENSIONS[i])) {
        return fail("測驗題目設定不完整，請聯絡管理員", 409);
      }
      if (answers.length !== 3 || new Set(answers.map((a) => a.questionId)).size !== 3) {
        return fail("請完成三題，每題只能選一個答案", 400);
      }
      const profile: GrowthProfile = { kind: "growth-v1", answers: [] };
      for (const question of questions) {
        const answer = answers.find((a) => a.questionId === question.id);
        const option = answer && ({ A: question.optionA, B: question.optionB, C: question.optionC, D: question.optionD })[answer.choice];
        if (!answer || !option) return fail("作答內容與目前題目不符，請重新作答", 400);
        const value = option as { label?: unknown; desc?: unknown };
        const label = value.label as GrowthProfile["answers"][number]["label"];
        const desc = value.desc as GrowthProfile["answers"][number]["desc"];
        if (typeof label?.en !== "string" || typeof label?.["zh-tw"] !== "string" ||
            typeof desc?.en !== "string" || typeof desc?.["zh-tw"] !== "string") {
          return fail("測驗選項設定不完整，請聯絡管理員", 409);
        }
        profile.answers.push({
          dimension: question.dimension as GrowthProfile["answers"][number]["dimension"],
          choice: answer.choice, label, desc,
        });
      }
      await prisma.$transaction([
        prisma.quizSubmission.create({ data: { userId: session.uid, answers, scores: profile } }),
        prisma.user.update({ where: { id: session.uid }, data: { quizCompleted: true, completed: true } }),
      ]);
      return ok({ kind: profile.kind });
    }
    const scorable: ScorableQuestion[] = questions.map((q) => {
      const cols: Record<Choice, unknown> = {
        A: q.optionA,
        B: q.optionB,
        C: q.optionC,
        D: q.optionD,
      };
      const options: Partial<Record<Choice, Scores>> = {};
      for (const c of CHOICES) {
        if (cols[c] != null) options[c] = optionScores(cols[c], q.dimension);
      }
      return { id: q.id, options };
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
