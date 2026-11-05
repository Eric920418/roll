import { z } from "zod";
import { dateSchema } from "@/lib/roadmap/schema";
import type { Diagnosis, GeneratedAction } from "../schemas";

type Words = readonly [string, string];
export const words = (value: Words, locale: string) => value[locale === "zh-tw" ? 0 : 1];
export const MILESTONES: Words[] = [
  ["確認目標客戶", "Confirm your target customer"], ["驗證付費意願", "Validate willingness to pay"],
  ["建立可複製的開發流程", "Build a repeatable acquisition process"], ["建立第一批穩定付費客戶", "Build your first paying customer cohort"],
  ["依驗證過的方法擴大營收", "Scale revenue using validated methods"],
];
export const STEPS = [
  { id: "01-1", milestone: 0, kind: "conversation", title: ["與 10 位目標客戶對話，確認痛點與付費意願", "Talk with 10 target customers about pain and willingness to pay"], criteria: ["10 位不同對象的對話，包含痛點與嚴重度、目前做法、付費訊號。", "10 distinct customer conversations with pain severity, current solution and willingness to pay."], guide: ["先問最近一次遇到問題的經驗，再問目前怎麼處理、造成多少損失，最後確認誰決定購買及付費意願。", "Ask about the last occurrence, current solution, impact, buying decision and willingness to pay."] },
  { id: "01-2", milestone: 0, kind: "organize", title: ["寫出一句話定位，並請 5 位受訪者確認", "Write a positioning statement and confirm it with five interviewees"], criteria: ["定位已確認，且 5 位受訪者透過確認連結回覆「符合」。", "Confirm the statement and receive five yes responses through interviewee confirmation links."], guide: ["用「我們幫助誰，解決什麼問題，得到什麼結果」寫一句話；複製專屬連結給受訪者，由對方回覆。", "Describe who you help, their problem and the outcome. Copy each private confirmation link to the interviewee."] },
  { id: "01-3", milestone: 0, kind: "organize", title: ["建立潛在客戶評分標準", "Define lead qualification criteria"], criteria: ["確認 4–6 項條件，權重合計 100%；少於 3 份佐證列為觀察條件。", "Confirm 4–6 criteria with weights totalling 100%; fewer than three sources means an observation."], guide: ["從有意願與無意願的對象比較差異，為每項條件選擇支持它的對話。觀察條件不參與評分。", "Compare interested and uninterested customers. Select supporting conversations. Observations do not contribute to scores."] },
  { id: "01-4", milestone: 0, kind: "organize", title: ["將已對話的客戶分級", "Score and tier your interviewees"], criteria: ["全部受訪者已確認 A／B／C 分級，至少 3 位 A 級；手動調整須填理由。", "Confirm a tier for every interviewee, including at least three A leads; explain manual overrides."], guide: ["符合條件的權重換算為百分比：80 分以上 A、60–79 分 B，其餘 C。", "Matched weights produce a percentage: A at 80+, B at 60–79, otherwise C."] },
  { id: "02-1", milestone: 1, kind: "outreach", title: ["向 3 位 A 級客戶提出付費試點", "Send paid pilot proposals to three A leads"], criteria: ["至少 3 位 A 級對象已收到提案，保存報價範圍、聯絡日期與管道。", "Send proposals to three A leads and save the offer, contact date and channel."], guide: ["沿用上一步的 A 級名單，說明價格、範圍、期間與成功標準，寄出後更新狀態。", "Use your A leads. Specify price, scope, duration and success criteria, then record the actual send."] },
  { id: "02-2", milestone: 1, kind: "document", title: ["取得付款或簽約證據", "Obtain payment or signed contract evidence"], criteria: ["至少一位收到提案的客戶有審核通過的付款或付費合約證明。", "One proposed customer has an approved payment or signed paid contract proof."], guide: ["上傳含金額與日期的轉帳、發票或簽署合約。等待管理員審核；口頭同意不算。", "Upload a dated payment record, invoice or signed paid contract with an amount. Administrator approval is required."] },
  { id: "02-3", milestone: 1, kind: "organize", title: ["確認定價與成交條件", "Confirm pricing and terms"], criteria: ["價格、試點範圍、成交條件三項皆已確認。", "Confirm price, pilot scope and commercial terms."], guide: ["參考已保存的提案、回覆與成交證明，記下最終可執行的條件。", "Use saved offers, replies and approved proof to confirm executable terms."] },
  { id: "03-1", milestone: 2, kind: "outreach", title: ["連續 4 週，每週聯絡 20 家符合標準的公司", "Contact 20 qualified companies weekly for four consecutive weeks"], criteria: ["連續 4 週，每週 20 家不同公司，合計 80 家並完成至少 12 次對話。", "Four consecutive weeks with 20 distinct companies each, 80 in total and at least 12 conversations."], guide: ["以台北時間週一至週日計算。逐家記錄日期、管道、符合條件與回覆；只計入此步驟開啟後的實際聯絡。", "Weeks run Monday–Sunday in Taipei. Record each company, date, channel, qualification and reply after this step opens."] },
  { id: "03-2", milestone: 2, kind: "organize", title: ["比較各管道成效，保留最有效的 2 個", "Compare channels and retain the best two"], criteria: ["依實際聯絡計算回覆率、對話率、成交率，確認保留 2 個管道。", "Calculate reply, conversation and conversion rates from records, then retain two channels."], guide: ["比較系統依紀錄整理的數據，不用自行填寫成效百分比。", "Compare rates calculated from saved records rather than entering percentages."] },
  { id: "03-3", milestone: 2, kind: "document", title: ["完成開發流程手冊", "Complete your acquisition playbook"], criteria: ["名單來源、聯絡訊息、對話腳本、成交步驟四章完成並確認，可列印為 PDF。", "Complete and confirm sources, outreach, conversation script and closing steps; export through print to PDF."], guide: ["沿用已保留管道與成交條件，將待補內容寫到另一位同事也能照做。", "Use your retained channels and terms. Add enough detail for a colleague to execute the process."] },
  { id: "04-1", milestone: 3, kind: "outreach", title: ["取得 5 位付費客戶", "Acquire five paying customers"], criteria: ["5 家不同公司各有審核通過的實際付款證明；簽約不代替付款。", "Five distinct companies each have an approved payment proof; contracts alone do not count."], guide: ["沿用試點與 A 級名單跟進，逐家上傳付款證明。", "Follow up with pilot and A leads, then upload each customer's payment evidence."] },
  { id: "04-2", milestone: 3, kind: "conversation", title: ["與付費客戶進行使用回顧，確認續約原因", "Review usage and renewal reasons with paying customers"], criteria: ["5 家已付款公司完成回顧，包含留下原因、尚缺功能及推薦對象。", "Five paying companies have reviews covering retention reasons, gaps and referrals."], guide: ["問最近如何使用、為何願意留下、還缺什麼，以及會推薦給誰。", "Ask how they use the product, why they stay, what is missing and whom they would refer."] },
  { id: "04-3", milestone: 3, kind: "organize", title: ["計算續約率與每位客戶帶來的收入", "Calculate renewal rate, revenue per customer and acquisition cost"], criteria: ["選擇幣別與到期客戶，補充行銷支出，確認系統計算的三項指標。", "Choose a currency and renewal-eligible customers, enter marketing spend and confirm three calculated metrics."], guide: ["續約只計入不同日期的再次付款。不同幣別分開計算；取得成本只含本次填寫的現金行銷支出。", "Renewals require another payment on a later date. Keep currencies separate; acquisition cost uses entered cash marketing spend."] },
  { id: "05-1", milestone: 4, kind: "organize", title: ["設定季度營收目標與每週開發量", "Set a quarterly revenue target and weekly activity"], criteria: ["確認季度目標與反推的每週聯絡、對話數；完成後建立 13 週待辦。", "Confirm the quarterly target and calculated weekly contacts and conversations; create 13 weekly tasks."], guide: ["以目前客單價與轉換率反推。若調整轉換率，明示為待驗證假設。", "Work back from revenue per customer and conversion. Any adjusted conversion is an explicit unverified assumption."] },
  { id: "05-2", milestone: 4, kind: "outreach", title: ["進入第二個市場", "Enter a second market"], criteria: ["不同於原市場的新市場有 10 家對話公司，且其中至少 1 家在本步開啟後付款並通過審核。", "A different market has ten company conversations and an approved payment after this step opens."], guide: ["沿用評分與提案方法，記錄新市場與實際回覆，再上傳付款證明。", "Reuse your qualification and offer, record the new market and conversations, then upload payment proof."] },
  { id: "05-3", milestone: 4, kind: "document", title: ["產出市場驗證報告，用於募資", "Produce your market validation report"], criteria: ["客戶證據、付費成果、開發方法、擴張計畫四章確認；完成後可建立或撤銷分享連結。", "Confirm customer evidence, payments, acquisition methods and expansion; enable or revoke sharing after completion."], guide: ["自動帶入已存成果，補充擴張計畫。報告不含原始對話或付款附件，分享預設關閉。", "Use saved results and add your expansion plan. Raw conversations and payment files are excluded; sharing is off by default."] },
] as const;
export type StepId = typeof STEPS[number]["id"];
export const STEP_TARGETS: Record<StepId, number> = { "01-1": 10, "01-2": 5, "01-3": 4, "01-4": 10, "02-1": 3, "02-2": 1, "02-3": 3, "03-1": 80, "03-2": 2, "03-3": 4, "04-1": 5, "04-2": 5, "04-3": 3, "05-1": 2, "05-2": 10, "05-3": 4 };
export type TemplateKind = typeof STEPS[number]["kind"];
export const stepIdSchema = z.enum(STEPS.map(s => s.id) as [StepId, ...StepId[]]);
export const flowKey = (id: StepId) => "nova_v2_" + id;
export function isFlowAction(action: { clientKey?: string }) { return Boolean(action.clientKey?.startsWith("nova_v2_")); }
export function flowStep(action: { clientKey: string }) { return STEPS.find(s => flowKey(s.id) === action.clientKey); }

const text = z.string().trim().max(4000), id = z.string().trim().max(200);
const record = z.object({ id: id.min(1), company: text, name: text, relationship: text, date: dateSchema.or(z.literal("")), pain: text, severity: z.enum(["", "low", "medium", "high"]), solution: text, wtp: z.enum(["", "not_asked", "willing", "considering", "declined"]), reason: text, missing: text, referral: text }).strict();
const contact = z.object({ id: id.min(1), company: text, name: text, leadId: id, date: dateSchema.or(z.literal("")), channel: text, status: z.enum(["draft", "sent", "replied", "conversation", "agreed"]), offer: text, matches: z.array(id).max(6), pain: text, solution: text, wtp: z.enum(["", "not_asked", "willing", "considering", "declined"]) }).strict();
export const flowDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("conversation"), market: text, records: z.array(record).max(250) }).strict(),
  z.object({ kind: z.literal("organize"), values: z.record(id, text), confirmed: z.array(id).max(30), criteria: z.array(z.object({ id: id.min(1), label: text, weight: z.number().int().min(1).max(100), sources: z.array(id).max(250), confirmed: z.boolean() }).strict()).max(6), tiers: z.array(z.object({ leadId: id, matches: z.array(id).max(6), override: z.enum(["", "A", "B", "C"]), reason: text, confirmed: z.boolean() }).strict()).max(250), selections: z.array(id).max(250) }).strict(),
  z.object({ kind: z.literal("outreach"), market: text, contacts: z.array(contact).max(500) }).strict(),
  z.object({ kind: z.literal("document"), sections: z.array(z.object({ id: id.regex(/^[0-3]$/), body: text, confirmed: z.boolean() }).strict()).max(4) }).strict(),
]);
export type FlowData = z.infer<typeof flowDataSchema>;
export const flowStoredSchema = z.object({ version: z.literal(2), step: stepIdSchema, data: flowDataSchema }).strict();
export const emptyRecord = (key: string): z.infer<typeof record> => ({ id: key, company: "", name: "", relationship: "", date: "", pain: "", severity: "", solution: "", wtp: "", reason: "", missing: "", referral: "" });
export const emptyContact = (key: string): z.infer<typeof contact> => ({ id: key, company: "", name: "", leadId: "", date: "", channel: "", status: "draft", offer: "", matches: [], pain: "", solution: "", wtp: "" });
export function emptyFlowData(kind: TemplateKind): FlowData {
  if (kind === "conversation") return { kind, market: "", records: [] };
  if (kind === "outreach") return { kind, market: "", contacts: [] };
  if (kind === "document") return { kind, sections: [] };
  return { kind, values: {}, confirmed: [], criteria: [], tiers: [], selections: [] };
}
export function flowMilestones(startsAt: string, deadline: string, locale: string) {
  const start = Date.parse(startsAt), span = Date.parse(deadline) - start;
  return MILESTONES.map((title, position) => ({
    title: words(title, locale), expectedOutcome: words(title, locale),
    acceptanceCriteria: STEPS.filter(s => s.milestone === position).map(s => words(s.criteria, locale)).join("\n"),
    targetDate: new Date(start + Math.ceil(span * [0.04, 0.14, 0.34, 0.67, 1][position])).toISOString().slice(0, 10),
  }));
}
export function flowActions(diagnosis: Diagnosis, locale: string): GeneratedAction[] {
  return STEPS.map((step, index) => ({
    clientKey: flowKey(step.id), title: words(step.title, locale), impact: "High", urgencyType: "scheduled", urgencyDays: 7,
    dependencyLevel: index ? 1 : 0, dependencyNotes: index ? words(["完成上一步後開啟", "Complete the previous step to unlock"], locale) : null,
    dependsOnKeys: index ? [flowKey(STEPS[index - 1].id)] : [], difficulty: 2, actionTime: { minMinutes: 30, maxMinutes: 120 },
    companyStage: diagnosis.companyStage, stageFit: { score: 5, reason: diagnosis.stageReason, confidence: null },
    bottleneckGroup: diagnosis.bottleneckGroup, bottleneckCode: diagnosis.bottleneckCode, bottleneckFit: { score: 5, reason: diagnosis.bottleneckReason, confidence: null },
    outcomeCategory: step.id === "05-3" ? "fundraising" : "customers", expectedOutcome: words(step.criteria, locale), outcomeTime: { min: 1, max: 28 },
  }));
}
export const ORGANIZE_FIELDS: Partial<Record<StepId, Array<{ key: string; label: Words; number?: boolean }>>> = {
  "01-2": [{ key: "positioning", label: ["一句話定位", "Positioning statement"] }],
  "02-3": [{ key: "price", label: ["價格與幣別", "Price and currency"] }, { key: "scope", label: ["試點範圍", "Pilot scope"] }, { key: "terms", label: ["成交條件", "Commercial terms"] }],
  "04-3": [{ key: "currency", label: ["計算幣別（例如 USD）", "Currency (for example USD)"] }, { key: "spend", label: ["現金行銷支出", "Cash marketing spend"], number: true }],
  "05-1": [{ key: "target", label: ["季度營收目標", "Quarterly revenue target"], number: true }, { key: "conversion", label: ["調整成交率（選填，0–1；屬假設）", "Conversion override (optional, 0–1; an assumption)"], number: true }],
};
export const CHAPTERS: Partial<Record<StepId, Words[]>> = {
  "03-3": [["名單來源", "Lead sources"], ["聯絡訊息", "Outreach message"], ["對話腳本", "Conversation script"], ["成交步驟", "Closing steps"]],
  "05-3": [["客戶證據", "Customer evidence"], ["付費成果", "Payment outcomes"], ["開發方法", "Acquisition methods"], ["擴張計畫", "Expansion plan"]],
};
