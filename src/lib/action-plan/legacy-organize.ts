import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { workspaceKind, workspaceSchema, storedFindingSchema } from "./workspace";
import { planWorkspaceEvidence } from "./workspace-service";
import { PlanWriteError, guardActionMilestone } from "./service";
import { emptyFlowData, emptyRecord, flowDataSchema, type FlowData } from "./flow/catalog";
import { evaluateStep, positioningReplies, type FlowContext } from "./flow/evaluate";

export type OrganizeData = Extract<FlowData, { kind: "organize" }>;
export function organizeMetadata(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function legacyOrganizeData(action: { title: string; clientKey?: string; taskWorkspace?: unknown; taskFinding?: unknown }): OrganizeData {
  const saved = flowDataSchema.safeParse(organizeMetadata(action.taskFinding).organizeData).data;
  if (saved?.kind === "organize") return saved;
  const data = emptyFlowData("organize") as OrganizeData, old = workspaceSchema.safeParse(action.taskWorkspace).data;
  if (old?.kind === "positioning") data.values = { positioningWho: old.who, positioningPain: old.pain, positioningMethod: old.how };
  return data;
}
export async function legacyActionState(tx: Prisma.TransactionClient, planId: string) {
  return tx.actionItem.findMany({ where: { actionPlanId: planId }, include: { dependencies: { include: { dependsOn: true } } } });
}
export async function getLegacyOrganize(tx: Prisma.TransactionClient, userId: string, planId: string, actionId: string, locale?: string) {
  const [actions, evidence] = await Promise.all([legacyActionState(tx, planId), planWorkspaceEvidence(tx, userId, planId)]);
  const action = actions.find(a => a.id === actionId), kind = action && workspaceKind(action);
  const plan = await tx.actionPlan.findFirst({ where: { id: planId, userId }, select: { id: true, revision: true, locale: true } });
  if (!action || !["positioning", "scorecard"].includes(kind || "") || !plan) throw new PlanWriteError("找不到本人的整理任務 / Your organization task was not found", 404);
  const step = kind === "positioning" ? "01-2" as const : "01-3" as const, data = legacyOrganizeData(action);
  // Old valid interviews keep their original eligibility; do not invent a new fit answer.
  const leads = evidence.leads.map(l => ({ ...emptyRecord(l.id), fit: undefined, company: l.company, name: l.name, pain: l.insight.notes, solution: l.insight.answers[0], date: l.insight.date, wtp: l.insight.commercial?.willingness || "not_asked" as const }));
  const context: FlowContext = { locale: locale || plan.locale, proofs: [], actions: [
    { id: "legacy-evidence", clientKey: "nova_v2_01-1", done: true, completedAt: null, taskFinding: null, taskWorkspace: { version: 2, step: "01-1", data: { kind: "conversation", market: "", records: leads } } },
    { ...action, clientKey: "nova_v2_" + step, taskWorkspace: { version: 2, step, data } },
  ] };
  return { action, context, step, data, leads, revision: plan.revision, positioningReplies: positioningReplies(context), result: evaluateStep(context, step) };
}
export type LegacyOrganizeView = Pick<Awaited<ReturnType<typeof getLegacyOrganize>>, "step" | "data" | "leads" | "positioningReplies" | "result" | "revision">;
export async function saveLegacyOrganize(tx: Prisma.TransactionClient, userId: string, planId: string, actionId: string, data?: OrganizeData, recipients?: string[]) {
  const view = await getLegacyOrganize(tx, userId, planId, actionId), a = view.action;
  if (a.done) throw new PlanWriteError("已完成紀錄保留，請先撤銷完成 / Completed records are retained; undo completion before editing", 409);
  const pending = storedFindingSchema.safeParse(a.taskFinding).data?.pending;
  if (pending && Date.now() - Date.parse(pending.since) < 120_000) throw new PlanWriteError("請等原有分析結束後再儲存；草稿保留 / Wait for the existing analysis to finish; draft retained", 409);
  await guardActionMilestone(tx, planId, a.milestoneId, "edit");
  const { dependencySatisfied } = await import("./dependency");
  if ((a.dependencyLevel > 0 && !a.dependencies.length) || a.dependencies.some(e => !dependencySatisfied(e))) throw new PlanWriteError("請先完成前置任務 / Complete prerequisites first", 409);
  const meta = organizeMetadata(a.taskFinding);
  if (data) {
    if (data.supplements?.length || data.tiers.length || (view.step === "01-2" && data.criteria.length)) throw new PlanWriteError("這一步的資料類型不符 / Data does not belong to this step", 400);
    const ids = new Set(view.leads.map(l => l.id));
    if (new Set(data.selections).size !== data.selections.length || data.selections.some(id => !ids.has(id)) || data.criteria.some(c => new Set(c.sources).size !== c.sources.length || c.sources.some(id => !ids.has(id)))) throw new PlanWriteError("請使用本計畫的訪談紀錄 / Use conversations from this plan", 400);
    const result = evaluateStep(view.context, view.step, data), changed = view.step === "01-2" && data.values.positioning !== view.data.values.positioning;
    await tx.actionItem.update({ where: { id: actionId }, data: { taskFinding: { ...meta, result: meta.result ?? null, organizeData: data, ...(changed ? { positioningVersion: randomBytes(16).toString("hex") } : {}) } as Prisma.InputJsonValue, metricCurrent: result.current, metricTarget: result.target, metricUnit: view.step === "01-2" ? "confirmations" : "criteria" } });
  }
  const links: Array<{ leadId: string; href: string }> = [];
  if (recipients) {
    const latest = await getLegacyOrganize(tx, userId, planId, actionId), m = organizeMetadata(latest.action.taskFinding);
    if (latest.step !== "01-2" || !latest.data.confirmed.includes("positioning") || !latest.data.values.positioning?.trim() || new Set(recipients).size !== recipients.length || recipients.some(id => !latest.leads.some(l => l.id === id))) throw new PlanWriteError("先儲存並確認定位，並選擇本計畫受訪者 / Save confirmed positioning and select plan participants", 409);
    const entries = recipients.map(leadId => { const token = randomBytes(32).toString("base64url"); links.push({ leadId, href: "/task-confirm/" + actionId + "?token=" + token }); return { leadId, version: m.positioningVersion, statement: latest.data.values.positioning, hash: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 30 * 86400000).toISOString() }; });
    await tx.actionItem.update({ where: { id: actionId }, data: { taskFinding: { ...m, links: [...(Array.isArray(m.links) ? m.links.filter(l => !recipients.includes(l.leadId)) : []), ...entries] } as Prisma.InputJsonValue } });
  }
  return links;
}
