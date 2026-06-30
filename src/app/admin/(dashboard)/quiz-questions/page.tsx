import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
import JsonRecordsAdmin, {
  type AdminRecord,
} from "@/components/admin/JsonRecordsAdmin";

export const dynamic = "force-dynamic";

const SCORES = (planningDepth: number, executionStrength: number, visionClarity: number) => ({
  planningDepth,
  executionStrength,
  visionClarity,
});

const TEMPLATE = {
  order: 0,
  dimension: "entry-style",
  prompt: { en: "", "zh-tw": "" },
  subtitle: { en: "", "zh-tw": "" },
  optionA: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
    icon: "doc",
    scores: SCORES(85, 50, 40),
  },
  optionB: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
    icon: "bolt",
    scores: SCORES(25, 88, 62),
  },
  optionC: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
    icon: "target",
    scores: SCORES(92, 72, 55),
  },
  optionD: {
    label: { en: "", "zh-tw": "" },
    desc: { en: "", "zh-tw": "" },
    icon: "layers",
    scores: SCORES(55, 52, 88),
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
      optionC: q.optionC,
      optionD: q.optionD,
      published: q.published,
    },
  }));

  return (
    <JsonRecordsAdmin
      resource="quiz-questions"
      title="測驗題目"
      description="市場進入風格測驗（雙語 JSON 編輯）。每題最多 4 選項（optionA–D，optionC/D 可留空＝2 選項題）；每選項的 scores = { planningDepth, executionStrength, visionClarity }（0~100）決定配對到哪位創辦人，icon 可用 doc/bolt/flame/layers/telescope/target。"
      records={records}
      template={TEMPLATE}
    />
  );
}
