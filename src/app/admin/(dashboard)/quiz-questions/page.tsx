import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
import JsonRecordsAdmin, {
  type AdminRecord,
} from "@/components/admin/JsonRecordsAdmin";

export const dynamic = "force-dynamic";

const TEMPLATE = {
  order: 0,
  dimension: "planning",
  prompt: { en: "", "zh-tw": "" },
  subtitle: { en: "", "zh-tw": "" },
  optionA: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
    icon: "doc",
    value: 80,
  },
  optionB: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
    icon: "bolt",
    value: 30,
  },
  published: true,
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
      published: q.published,
    },
  }));

  return (
    <JsonRecordsAdmin
      resource="quiz-questions"
      title="測驗題目"
      description="決策風格測驗題目（雙語 JSON 編輯）。dimension 為 planning / execution / vision；每個選項的 value(0~100) 是該維度分數，icon 可用 doc/bolt/flame/layers/telescope/target。"
      records={records}
      template={TEMPLATE}
    />
  );
}
