import { z } from "zod";
import { companyKey } from "@/lib/customer-insights/interviews";
import { insightSchema, type Insight } from "@/lib/customer-insights/schema";

const text = z.string().trim().max(2000);
const id = z.string().min(1).max(200);
export const workspaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("icp"), candidates: z.array(z.object({ name: text, industry: text, size: text, role: text, pain: text, trigger: text }).strict()).min(1).max(5) }).strict(),
  z.object({ kind: z.literal("pilot"), prospects: z.array(z.object({ leadId: z.string().max(200), offer: text, response: z.enum(["", "agreed", "declined", "thinking"]), reason: text }).strict()).min(1).max(20) }).strict(),
  z.object({ kind: z.literal("positioning"), who: text, pain: text, outcome: text, how: text, tested: z.number().int().min(0).max(1000000), reaction: text }).strict(),
  z.object({ kind: z.literal("scorecard"), criteria: z.array(z.object({ id, criterion: text, weight: z.number().int().min(1).max(5), fit: text }).strict()).min(1).max(20) }).strict(),
  z.object({ kind: z.literal("tiers"), leads: z.array(z.object({ leadId: id, tier: z.enum(["", "A", "B", "C"]), segment: text, matches: z.array(id).max(20) }).strict()).max(200) }).strict(),
]);
export type TaskWorkspace = z.infer<typeof workspaceSchema>;
export type WorkspaceKind = TaskWorkspace["kind"] | "interview";
export const findingSchema = z.object({ cards: z.array(z.object({ title: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(1000), evidence: z.string().trim().max(2000) }).strict()).length(3), why: z.string().trim().min(1).max(1500) }).strict();
export const findingDraftSchema = findingSchema.extend({ cards: z.array(findingSchema.shape.cards.element.extend({ title: z.string().max(120), text: z.string().max(1000) })).length(3), why: z.string().max(1500) });
export const storedFindingSchema = z.object({ result: findingSchema.nullable(), source: z.enum(["ai", "user"]).optional(), generatedAt: z.iso.datetime().optional(), pending: z.object({ requestId: z.string().uuid(), since: z.iso.datetime() }).strict().optional(), error: z.string().max(2000).optional() }).strict();
export type TaskFinding = z.infer<typeof storedFindingSchema>;

// shortcut: Existing AI tasks have no typed workspace; infer these six families from their titles until generation returns a typed kind.
export function workspaceKind(action: { title: string; recordingMode?: string | null; taskWorkspace?: unknown }): WorkspaceKind | null {
  const stored = workspaceSchema.safeParse(action.taskWorkspace);
  if (stored.success) return stored.data.kind;
  if (action.recordingMode === "interview") return "interview";
  const title = action.title.normalize("NFKC");
  if (/segment|\btiers?\b|分級|分群/.test(title.toLowerCase())) return "tiers";
  if (/scorecard|scoring|評分卡|評分表/i.test(title)) return "scorecard";
  if (/positioning|one.sentence|定位句|定位聲明|一句話.*定位/i.test(title)) return "positioning";
  if (/paid pilot|pilot offer|付費試用|付費試點/i.test(title)) return "pilot";
  if (/interview|訪談/i.test(title)) return "interview";
  if (/(define|document|draft|建立|定義|記錄|撰寫).*(ICP|ideal customer profile|理想客戶)|ICP.*(candidate|候選|假設)/i.test(title)) return "icp";
  return null;
}
export function interviewTarget(action: { title: string; metricTarget?: number | null; metric?: { target: number | null } }): number | null {
  const configured = action.metricTarget ?? action.metric?.target;
  if (configured && configured > 0) return configured;
  const match = action.title.normalize("NFKC").match(/(?:interview\s+|訪談\s*)(\d{1,4})(?:\s|位|間|家)/i);
  return match && Number(match[1]) > 0 ? Number(match[1]) : null;
}
export function emptyWorkspace(kind: Exclude<WorkspaceKind, "interview">): TaskWorkspace {
  switch (kind) {
    case "icp": return { kind, candidates: Array.from({ length: 5 }, () => ({ name: "", industry: "", size: "", role: "", pain: "", trigger: "" })) };
    case "pilot": return { kind, prospects: Array.from({ length: 3 }, () => ({ leadId: "", offer: "", response: "", reason: "" })) };
    case "positioning": return { kind, who: "", pain: "", outcome: "", how: "", tested: 0, reaction: "" };
    case "scorecard": return { kind, criteria: Array.from({ length: 5 }, (_, i) => ({ id: `criterion_${i + 1}`, criterion: "", weight: 3, fit: "" })) };
    case "tiers": return { kind, leads: [] };
  }
}
export type WorkspaceLead = { id: string; name: string; company: string; insight: Insight };
export function workspaceLeads(rows: Array<{ id: string; updatedAt: string | Date; insight: unknown }>): WorkspaceLead[] {
  const seen = new Set<string>();
  return [...rows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id.localeCompare(a.id)).flatMap(row => {
    const v = insightSchema.safeParse(row.insight);
    if (!v.success || v.data.stage === "angel_round" || !["Prospect", "User", "Buyer", "Decision maker"].includes(v.data.type) || !v.data.company || !(v.data.answers.some(Boolean) || v.data.notes)) return [];
    const key = `${companyKey(v.data.name)}|${companyKey(v.data.company)}`;
    if (seen.has(key)) return [];
    seen.add(key); return [{ id: row.id, name: v.data.name, company: v.data.company, insight: v.data }];
  });
}
export function leadScore(matches: string[], criteria: Extract<TaskWorkspace, { kind: "scorecard" }>["criteria"]) {
  const valid = criteria.filter(c => c.criterion && c.fit), unique = new Set(matches);
  return { score: valid.reduce((sum, c) => sum + (unique.has(c.id) ? c.weight : 0), 0), max: valid.reduce((sum, c) => sum + c.weight, 0) };
}
export function workspaceProgress(workspace: TaskWorkspace) {
  switch (workspace.kind) {
    case "icp": return { current: workspace.candidates.filter(c => c.name && c.industry && c.size && c.role && c.pain && c.trigger).length, target: 5, unit: "candidates" };
    case "pilot": return { current: new Set(workspace.prospects.filter(p => p.leadId && p.offer && p.response === "agreed" && p.reason).map(p => p.leadId)).size, target: workspace.prospects.length, unit: "agreed pilots" };
    case "positioning": return { current: Number(Boolean(workspace.who && workspace.pain && workspace.outcome && workspace.how && workspace.tested > 0 && workspace.reaction)), target: 1, unit: "validated statement" };
    case "scorecard": return { current: workspace.criteria.filter(c => c.criterion && c.fit).length, target: workspace.criteria.length, unit: "criteria" };
    case "tiers": return { current: workspace.leads.filter(l => l.tier && l.segment).length, target: Math.max(1, workspace.leads.length), unit: "leads" };
  }
}
export function workspaceComplete(workspace: TaskWorkspace | null) {
  if (!workspace) return false;
  const progress = workspaceProgress(workspace);
  if (workspace.kind === "icp" || workspace.kind === "pilot") return progress.current >= 1;
  return progress.current >= progress.target;
}
export function groundedFinding(raw: unknown, sources: string[]) {
  const result = findingSchema.parse(raw);
  const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (result.cards.some(card => !card.evidence || !sources.some(s => normalize(s).includes(normalize(card.evidence))))) throw new Error("AI 分析缺少有效依據，請重試 / AI findings lack saved evidence; retry");
  return result;
}
