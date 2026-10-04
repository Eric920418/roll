import { z } from "zod";
export const INSIGHT_STAGES = ["discover", "mvp", "first_sales", "angel_round"] as const;
export type InsightStage = typeof INSIGHT_STAGES[number];
export const STAGE_CONFIG = {
  discover: { title: ["Discover", "客戶探索"], goal: ["Interview 10 people", "訪談 10 位潛在客戶"], target: 10, unit: ["conversations", "次對話"], types: ["Prospect", "Industry expert", "Mentor", "Internal"], fields: [["How they solve it today", "目前如何解決"], ["What it costs them", "付出的成本"], ["Who decides", "誰做決定"], ["Next step and date", "下一步與日期"]] },
  mvp: { title: ["MVP", "MVP"], goal: ["5 weekly users, 3 ready to pre-pay", "5 位週活躍使用者，3 位願意預付"], target: 5, unit: ["conversations", "次對話"], types: ["User", "Prospect", "Mentor", "Internal"], fields: [["What they tried", "試用了什麼"], ["Most useful feature", "最有用的功能"], ["Price reaction", "對價格的反應"], ["What blocks them", "使用障礙"]] },
  first_sales: { title: ["First sales", "首次銷售"], goal: ["Close 3 paying customers", "取得 3 位付費客戶"], target: 3, unit: ["conversations", "次對話"], types: ["Buyer", "Decision maker", "Partner", "Mentor"], fields: [["Their role and need", "角色與需求"], ["Price reaction", "對價格的反應"], ["Main objection", "主要疑慮"], ["Next step and date", "下一步與日期"]] },
  angel_round: { title: ["Angel round", "天使輪"], goal: ["Hold 20 investor conversations", "進行 20 次投資人對話"], target: 20, unit: ["conversations", "次對話"], types: ["Angel", "VC scout", "Advisor", "Customer reference"], fields: [["Investor type and focus", "投資人類型與關注"], ["What they liked", "認同的部分"], ["Main concern", "主要顧慮"], ["Next step and date", "下一步與日期"]] },
} as const;
export const insightSchema = z.object({
  stage: z.enum(INSIGHT_STAGES), name: z.string().trim().min(1).max(200), company: z.string().trim().max(200), role: z.string().trim().max(200),
  type: z.string().max(40), fit: z.enum(["unknown", "yes", "partly", "no"]),
  answers: z.array(z.string().trim().max(4000)).length(4), notes: z.string().trim().max(8000),
  region: z.string().trim().max(200), industry: z.string().trim().max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
}).strict().superRefine((v, ctx) => {
  if (!(STAGE_CONFIG[v.stage].types as readonly string[]).includes(v.type)) ctx.addIssue({ code: "custom", path: ["type"], message: "Invalid conversation type for this stage" });
  if (v.date && (Number.isNaN(Date.parse(v.date)) || new Date(v.date).toISOString().slice(0, 10) !== v.date)) ctx.addIssue({ code: "custom", path: ["date"], message: "Invalid date" });
});
export type Insight = z.infer<typeof insightSchema>;
export function emptyInsight(stage: InsightStage): Insight { return { stage, name: "", company: "", role: "", type: STAGE_CONFIG[stage].types[0], fit: "unknown", answers: ["", "", "", ""], notes: "", region: "", industry: "", date: "" }; }
export function insightBody(v: Insight) { return [v.company, v.role, `Type: ${v.type}`, `ICP fit: ${v.fit}`, ...v.answers.map((answer, i) => answer ? `${STAGE_CONFIG[v.stage].fields[i][0]}: ${answer}` : ""), v.notes, v.region, v.industry].filter(Boolean).join("\n\n"); }
export const stageOutcomeSchema = z.object({ stage: z.enum(INSIGHT_STAGES), primaryCount: z.number().int().min(0).max(1000000), secondaryCount: z.number().int().min(0).max(1000000), note: z.string().trim().min(10).max(4000), confirmed: z.literal(true) }).strict();
export function stageEvidence(stage: InsightStage, values: unknown[]) {
  const types: Record<InsightStage, string[]> = { discover: ["Prospect"], mvp: ["User"], first_sales: ["Buyer", "Decision maker"], angel_round: ["Angel", "VC scout"] };
  return values.flatMap(value => { const parsed = insightSchema.safeParse(value); return parsed.success && parsed.data.stage === stage && types[stage].includes(parsed.data.type) && (parsed.data.answers.some(Boolean) || parsed.data.notes) ? [parsed.data] : []; });
}
export function uniqueStagePeople(stage: InsightStage, values: unknown[]) { return new Set(stageEvidence(stage, values).map(v => `${v.name.trim().normalize("NFKC").toLowerCase()}|${v.company.trim().normalize("NFKC").toLowerCase()}`)).size; }
export function stageOutcomeMet(outcome: z.infer<typeof stageOutcomeSchema>, people: number) {
  if (outcome.stage === "discover") return people >= 10 && outcome.secondaryCount >= 3 && outcome.secondaryCount <= people;
  if (outcome.stage === "mvp") return people >= 5 && outcome.primaryCount >= 5 && outcome.primaryCount <= people && outcome.secondaryCount >= 3 && outcome.secondaryCount <= people;
  if (outcome.stage === "first_sales") return people >= 3 && outcome.primaryCount >= 3 && outcome.primaryCount <= people;
  return people >= 20;
}
