import { z } from "zod";
import { workspaceKind } from "@/lib/action-plan/workspace";
import { insightSchema } from "@/lib/customer-insights/schema";
import { companyKey, type InterviewRow } from "@/lib/customer-insights/interviews";

export const commercialStateSchema = z.object({ requiresConfirmation: z.boolean(), confirmedAt: z.iso.datetime().optional() });
export const scopeSchema = z.object({ planId: z.string().min(1).max(200).optional(), journeyId: z.string().min(1).max(200).optional() }).refine(v => Boolean(v.planId) !== Boolean(v.journeyId), "Choose one workspace / 請選一個工作區");
export type Scope = z.infer<typeof scopeSchema>;
export const salesStatuses = ["contacted", "awaiting_reply", "quoted", "considering", "declined", "signed", "paid"] as const;
export const proofSchema = z.object({
  id: z.string().uuid(), kind: z.enum(["signed", "paid"]), amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/).refine(v => Number(v) > 0, "Amount must be positive / 金額須大於零"),
  currency: z.string().regex(/^[A-Z]{3}$/), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Invalid date"),
  pathname: z.string().min(1).max(1000), filename: z.string().min(1).max(200), confirmed: z.literal(true),
  revokedAt: z.iso.datetime().optional(), revokeReason: z.string().max(2000).optional(),
}).strict();
export const salesEventSchema = z.object({
  requestId: z.string().uuid(), payloadHash: z.string().optional(), at: z.iso.datetime(), status: z.enum(salesStatuses), quote: z.string().max(4000), reason: z.string().max(4000),
  amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).or(z.literal("")), currency: z.string().regex(/^[A-Z]{3}$/).or(z.literal("")),
}).strict();
export const salesRecordSchema = z.object({
  scope: scopeSchema, company: z.string().trim().min(1).max(200), name: z.string().trim().max(200), sourceId: z.string().max(200).optional(),
  version: z.number().int().nonnegative(), status: z.enum(salesStatuses),
  events: z.array(salesEventSchema).max(500), proofs: z.array(proofSchema).max(100),
  scripts: z.record(z.string(), z.string().max(8000)).optional(),
  rejection: z.object({ source: z.string(), result: z.unknown().optional(), token: z.string().optional(), since: z.iso.datetime().optional() }).optional(),
}).strict();
export type SalesRecord = z.infer<typeof salesRecordSchema>;
export const salesMutationSchema = z.object({
  scope: scopeSchema, requestId: z.string().uuid(), version: z.number().int().nonnegative(),
  company: z.string().trim().min(1).max(200), name: z.string().trim().max(200), sourceId: z.string().max(200).optional(), contactId: z.string().min(1).max(200).optional(),
  status: z.enum(salesStatuses), quote: z.string().trim().max(4000), reason: z.string().trim().max(4000),
  amount: salesEventSchema.shape.amount, currency: salesEventSchema.shape.currency,
  proof: proofSchema.omit({ revokedAt: true, revokeReason: true }).optional(),
  revoke: z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(2000) }).optional(),
  scripts: z.record(z.string(), z.string().max(8000)).optional(),
}).strict().superRefine((value, ctx) => { if (value.proof && value.proof.kind !== value.status) ctx.addIssue({ code: "custom", path: ["proof", "kind"], message: "證據類型須與付款／簽約狀態一致 / Proof kind must match payment or signing status" }); });
export type SalesMutation = z.infer<typeof salesMutationSchema>;
export function sameScope(a: Scope, b: Scope) { return a.planId === b.planId && a.journeyId === b.journeyId; }
export function validProofs(record: SalesRecord) { return record.proofs.filter(p => !p.revokedAt); }
export function commitmentSummary(records: SalesRecord[]) {
  const signed = new Set<string>(), paid = new Set<string>();
  const amounts: Record<string, { signed: number; paid: number }> = {};
  for (const record of records) for (const proof of validProofs(record)) {
    (proof.kind === "paid" ? paid : signed).add(companyKey(record.company));
    const currency = amounts[proof.currency] ||= { signed: 0, paid: 0 };
    currency[proof.kind] += Math.round(Number(proof.amount) * 100);
  }
  return { total: new Set([...signed, ...paid]).size, signed: signed.size, paid: paid.size, amounts };
}
export function commercialTask(action: { title: string; taskWorkspace?: unknown; commercialValidation?: unknown }) {
  return !!action.commercialValidation || workspaceKind(action) === "pilot" || /paying customer|paid commitment|付費試營運|付費客戶|付費承諾|收款|付費合約/i.test(action.title);
}
export function commercialTarget(action: { metricTarget?: number | null; title: string; expectedOutcome?: string }) {
  if (action.metricTarget && action.metricTarget > 0) return action.metricTarget;
  // An offer to 3 prospects with one acceptance means one commitment, not three payments.
  const match = `${action.expectedOutcome || ""} ${action.title}`.match(/(?:at least|close|secure|obtain|取得|至少)\s*(\d+)\s*(?:paying|paid|customers|位付費|家)/i);
  return match ? Number(match[1]) : 1;
}
export function priorityCompanies(rows: InterviewRow[], contacts: { id: string; name: string; company: string | null }[], records: SalesRecord[]) {
  const companies = new Map<string, { company: string; name: string; sourceId?: string; contactId?: string; quote: string; amount: string; currency: string; willingness: string; heat: string; respondedAt: string; status?: SalesRecord["status"] }>();
  for (const row of [...rows].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt) || b.id.localeCompare(a.id))) {
    const parsed = insightSchema.safeParse(row.insight);
    if (!parsed.success || !parsed.data.company || !(parsed.data.notes || parsed.data.answers.some(Boolean))) continue;
    const v = parsed.data, key = companyKey(v.company);
    if (companies.has(key)) continue;
    const linked = contacts.find(c => c.id === v.commercial?.contactId && companyKey(c.company || "") === key) || contacts.find(c => companyKey(c.company || "") === key && companyKey(c.name) === companyKey(v.name));
    companies.set(key, { company: v.company, name: linked?.name || v.name, sourceId: row.id, contactId: linked?.id, quote: v.commercial?.quote || v.answers.find(Boolean) || v.notes, amount: v.commercial?.amount || "", currency: v.commercial?.currency || "", willingness: v.commercial?.willingness || "not_asked", heat: v.commercial?.heat || "unknown", respondedAt: v.commercial?.respondedAt || (v.date ? `${v.date}T00:00:00Z` : "") });
  }
  for (const record of records) {
    const key = companyKey(record.company), last = record.events.at(-1);
    const value = companies.get(key) || { company: record.company, name: record.name, quote: "", amount: "", currency: "", willingness: "not_asked", heat: "unknown", respondedAt: "" };
    companies.set(key, { ...value, name: record.name || value.name, status: record.status, ...(record.status === "declined" ? { willingness: "declined" } : {}), ...(last ? { respondedAt: last.quote ? last.at : value.respondedAt, amount: last.amount || value.amount, currency: last.currency || value.currency } : {}) });
  }
  const willingness: Record<string, number> = { willing: 3, considering: 2, not_asked: 1, declined: 0 }, heat: Record<string, number> = { hot: 3, warm: 2, cold: 1, unknown: 0 };
  return [...companies.values()].sort((a, b) => willingness[b.willingness] - willingness[a.willingness] || heat[b.heat] - heat[a.heat] || b.respondedAt.localeCompare(a.respondedAt) || a.company.localeCompare(b.company)).slice(0, 5);
}
export const scriptNames = ["First contact", "Interview opening", "Pain confirmation", "Price test", "Paid pilot", "Payment / signing invitation", "Objections and follow-up"];
export const scriptNamesZh = ["首次聯絡", "訪談開場", "痛點確認", "價格測試", "付費試點", "付款／簽約邀請", "異議與跟進"];
export function standardScripts(value: { name: string; company: string; quote: string; amount: string; currency: string }, zh: boolean) {
  const name = value.name || (zh ? "[對方姓名]" : "[name]"), company = value.company || "[company]", pain = value.quote || (zh ? "[已確認痛點]" : "[confirmed pain]"), price = value.amount && value.currency ? `${value.currency} ${value.amount}` : (zh ? "[金額與幣別]" : "[amount and currency]");
  return zh ? [
    `${name} 你好，想請教 ${company} 對「${pain}」的經驗，是否方便安排半小時？`,
    `${name}，謝謝你。我想了解實際情況，沒有標準答案。最近一次遇到「${pain}」是什麼時候？`,
    `你提過「${pain}」。我理解正確嗎？目前怎麼處理，影響有多大？`,
    `如果能協助處理「${pain}」，以 ${price} 的價格，你會考慮付費嗎？由誰決定，還需要確認什麼？`,
    `是否願意討論一個 ${price} 的付費試點？我們先共同確認 [範圍]、[期間] 與 [成功標準]，再決定是否開始。`,
    `${name}，若條件已確認，請檢視 [付費合約／付款連結]：${price}，範圍為 [交付內容]。有任何問題請先告訴我。`,
    `${name}，想跟進你對「${pain}」與 ${price} 方案的考量。目前最大的顧慮是什麼？若暫時不適合，也歡迎直接告訴我。`,
  ] : [
    `Hi ${name}, could I ask about ${company}'s experience with “${pain}”? Would a 30-minute conversation work?`,
    `Thanks, ${name}. I want to understand your experience, with no right answer. When did you last encounter “${pain}”?`,
    `You mentioned “${pain}”. Have I understood correctly? How do you handle it now, and what is its impact?`,
    `If we could help with “${pain}”, would you consider paying ${price}? Who decides, and what would need to be confirmed?`,
    `Would you discuss a paid pilot at ${price}? Let's agree on [scope], [duration] and [success criteria] before deciding.`,
    `${name}, if the terms are agreed, please review [paid contract / payment link] for ${price}, covering [deliverables]. Please raise any questions first.`,
    `Hi ${name}, following up on “${pain}” and the ${price} proposal. What is your main concern? If this is not a fit now, please let me know.`,
  ];
}
export function salesNext(status?: string, zh = false) {
  const labels: Record<string, [string, string]> = { contacted: ["Confirm the next conversation", "確認下一次對話"], awaiting_reply: ["Follow up and record the reply", "跟進並記錄回覆"], quoted: ["Ask for a payment or paid-contract decision", "確認付款或付費合約決定"], considering: ["Ask what blocks a decision", "詢問決策障礙"], declined: ["Record the exact objection, then clarify", "記錄原話並澄清拒絕原因"], signed: ["Confirm payment and retain the receipt", "確認付款並保存收據"], paid: ["Confirm outcomes and continue", "確認成果並繼續"] };
  return (labels[status || ""] || ["Contact this person and test the price", "聯絡這位受訪者並測試價格"])[zh ? 1 : 0];
}
