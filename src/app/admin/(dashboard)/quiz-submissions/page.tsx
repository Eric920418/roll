import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
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
      (s.answers as { questionId: string; choice: "A" | "B" }[] | null) ?? [];
    const answerText = answers.map((a) => {
      const q = qmap.get(a.questionId);
      if (!q) return `?·${a.choice}`;
      const opt = (a.choice === "A" ? q.optionA : q.optionB) as {
        label?: unknown;
      };
      return pick(opt.label, "zh-tw") || a.choice;
    });
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
      scores: `P${scores.planningDepth ?? "?"} / E${
        scores.executionStrength ?? "?"
      } / V${scores.visionClarity ?? "?"}`,
      createdAt: s.createdAt.toISOString(),
    };
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">測驗提交紀錄</h1>
      <p className="mb-6 text-sm text-neutral-500">
        用戶完成決策風格測驗後的作答與配對結果
      </p>
      <QuizSubmissionsList submissions={submissions} />
    </div>
  );
}
