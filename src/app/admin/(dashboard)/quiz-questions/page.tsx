import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
import JsonRecordsAdmin, {
  type AdminRecord,
} from "@/components/admin/JsonRecordsAdmin";

export const dynamic = "force-dynamic";

const TEMPLATE = {
  order: 0,
  dimension: "growth-bottleneck",
  prompt: { en: "", "zh-tw": "" },
  subtitle: { en: "", "zh-tw": "" },
  optionA: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
  },
  optionB: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
  },
  optionC: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
  },
  optionD: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
  },
  published: false,
};

export default async function QuizQuestionsAdminPage() {
  const rows = await prisma.quizQuestion.findMany({ orderBy: { order: "asc" } });
  const records: AdminRecord[] = rows.map((q) => ({
    id: q.id,
    summary: `${q.order}. [${q.dimension}] ${pick(q.prompt, "zh-tw")}${
      q.published ? "" : " [隱藏]"
    }`,
    data: {
      order: q.order,
      dimension: q.dimension,
      prompt: q.prompt,
      subtitle: q.subtitle,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      published: q.published,
    },
  }));

  return (
    <JsonRecordsAdmin
      resource="quiz-questions"
      title="測驗題目"
      description="成長診斷使用固定的三題：growth-bottleneck、growth-style、growth-milestone；每題需有 A–D 四個雙語選項。修改已發布題目時請維持題目順序與 dimension。舊版創辦人題目留存供歷史紀錄查閱。"
      records={records}
      template={TEMPLATE}
    />
  );
}
