import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
import { parseGrowthProfile } from "@/lib/quiz/growth";
import QuizSubmissionsList, {
  type SubmissionRow,
} from "@/components/admin/QuizSubmissionsList";

export const dynamic = "force-dynamic";

export default async function QuizSubmissionsPage() {
  const [rows, questions] = await Promise.all([
    prisma.quizSubmission.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: true, founder: true },
    }),
    prisma.quizQuestion.findMany({ orderBy: { order: "asc" } }),
  ]);
  const qmap = new Map(questions.map((q) => [q.id, q]));

  const submissions: SubmissionRow[] = rows.map((s) => {
    const answers =
      (s.answers as { questionId: string; choice: "A" | "B" | "C" | "D" }[] | null) ?? [];
    const answerText = answers.map((a) => {
      const q = qmap.get(a.questionId);
      if (!q) return `?·${a.choice}`;
      const opt = ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD })[a.choice] as {
        label?: unknown;
      } | null;
      return pick(opt?.label, "zh-tw") || a.choice;
    });
    const growth = parseGrowthProfile(s.scores);
    const scores =
      (s.scores as {
        planningDepth?: number;
        executionStrength?: number;
        visionClarity?: number;
      } | null) ?? {};
    return {
      id: s.id,
      email: s.user.email,
      name: [s.user.firstName, s.user.lastName].filter(Boolean).join(" "),
      founder: s.founder ? pick(s.founder.name, "zh-tw") : "—",
      answers: answerText,
      scores: growth ? "成長診斷" : `P${scores.planningDepth ?? "?"} / E${
        scores.executionStrength ?? "?"
      } / V${scores.visionClarity ?? "?"}`,
      createdAt: s.createdAt.toISOString(),
    };
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">測驗提交紀錄</h1>
      <p className="mb-6 text-sm text-neutral-500">
        用戶的成長診斷作答；舊版紀錄保留創辦人配對結果
      </p>
      <QuizSubmissionsList submissions={submissions} />
    </div>
  );
}
