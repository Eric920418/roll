import { evidenceStateSchema } from "@/lib/evidence/schema";
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lockActivePlan, PlanWriteError, serializePlan } from "../service";
import { prepareActionReward, awardReward } from "@/lib/rewards/service";
import { completeGettingStarted } from "@/lib/getting-started/service";
import { salesRecordSchema, sameScope } from "@/lib/validation/schema";
import { today } from "@/lib/roadmap/schema";
import { STEPS, flowKey, flowStep, flowStoredSchema, flowDataSchema, stepIdSchema, flowMilestones, emptyFlowData } from "./catalog";
import { flowView, dataAt, records, criteria, tiers, channels, paidCompanies, customerMetrics, weeklyTarget, evaluateStep, type FlowContext, type Confirmation } from "./evaluate";

type DB = Prisma.TransactionClient;
const include = { milestones: true, actions: { include: { dependencies: { select: { minimumCurrent: true, dependsOn: { select: { id: true, clientKey: true, title: true, done: true, commercialValidation: true, metricCurrent: true, metricUnit: true } } } } } } } as const;
type Record = NonNullable<Awaited<ReturnType<typeof readPlan>>>;
export async function readPlan(userId: string, planId?: string, tx: DB = prisma as unknown as DB) {
  const plan = await tx.actionPlan.findFirst({ where: { userId, ...(planId ? { id: planId } : { activeKey: userId, archivedAt: null }) }, include });
  if (!plan) throw new PlanWriteError("找不到本人計畫 / Your plan was not found", 404);
  return plan;
}
export async function flowContext(plan: Record, tx: DB = prisma as unknown as DB): Promise<FlowContext> {
  const deals = await tx.deal.findMany({ where: { userId: plan.userId, validation: { not: Prisma.DbNull } }, select: { validation: true } });
  const proofs = deals.flatMap(d => { const record = salesRecordSchema.safeParse(d.validation).data; return record && sameScope(record.scope, { planId: plan.id }) ? record.proofs.map(p => ({ ...p, company: record.company, name: record.name, approved: p.review?.status === "approved", reviewStatus: p.review?.status || "pending", reviewNote: p.review?.note || "", revoked: Boolean(p.revokedAt) })) : []; });
  return { actions: plan.actions, proofs, locale: plan.locale };
}
const metadata = (value: unknown): { positioningVersion?: string; links?: Array<{ version: string; leadId: string; hash: string; statement: string; expires: string }>; responses?: Confirmation[]; share?: { hash: string; expires: string; fingerprint: string } | null; completionRequest?: string; outcome?: unknown } => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function reportFingerprint(plan: Record, context: FlowContext) {
  const actions = [...plan.actions].sort((a, b) => a.id.localeCompare(b.id)).map(a => [a.id, a.done, a.taskWorkspace]);
  const proofs = [...context.proofs].sort((a, b) => a.id.localeCompare(b.id)).map(p => [p.id, p.company, p.kind, p.amount, p.currency, p.date, p.approved, p.revoked]);
  return hash(JSON.stringify([plan.goal, plan.goalDeadline, actions, proofs]));
}

export async function getFlow(userId: string, planId?: string, locale?: string) {
  const plan = await readPlan(userId, planId), context = await flowContext(plan);
  if (locale) context.locale = locale;
  const history = await prisma.actionPlan.findMany({ where: { userId, archivedAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, goal: true, createdAt: true } });
  const isV2 = plan.actions.some(a => a.clientKey.startsWith("nova_v2_"));
  const steps = isV2 ? flowView(context) : [];
  const financial = metadata(plan.actions.find(a => flowStep(a)?.id === "04-3" && a.done)?.taskFinding).outcome as { metrics?: ReturnType<typeof customerMetrics> } | undefined;
  const growth = metadata(plan.actions.find(a => flowStep(a)?.id === "05-1" && a.done)?.taskFinding).outcome as { weekly?: ReturnType<typeof weeklyTarget> } | undefined;
  return { plan: serializePlan(plan), archived: Boolean(plan.archivedAt), steps, current: steps.find(s => !s.done)?.id || null,
    leads: records(context), criteria: criteria(context), tiers: tiers(context), channels: channels(context), payments: paidCompanies(context).map(p => ({ company: p.company, name: p.name, currency: p.currency })),
    metrics: financial?.metrics || customerMetrics(context), weekly: growth?.weekly || weeklyTarget(context),
    proofStatus: context.proofs.map(p => ({ company: p.company, kind: p.kind, approved: p.approved, revoked: p.revoked, status: p.reviewStatus || "pending", note: p.reviewNote || "" })),
    integrity: steps.filter(s => s.done && !s.ready).map(s => ({ step: s.id, reasons: s.reasons })),
    reportCode: "NV-" + hash(plan.id).slice(0, 4).toUpperCase() + "-" + hash(plan.id).slice(4, 8).toUpperCase(),
    shared: Boolean(metadata(plan.actions.find(a => flowStep(a)?.id === "05-3")?.taskFinding).share),
    history: history.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
  };
}
export type FlowView = Awaited<ReturnType<typeof getFlow>>;
export const flowMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), planId: z.string().min(1), revision: z.number().int().nonnegative(), step: stepIdSchema, data: flowDataSchema }).strict(),
  z.object({ action: z.literal("complete"), planId: z.string().min(1), revision: z.number().int().nonnegative(), step: stepIdSchema, requestId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("confirmLink"), planId: z.string().min(1), revision: z.number().int().nonnegative(), leadId: z.string().min(1) }).strict(),
  z.object({ action: z.literal("share"), planId: z.string().min(1), revision: z.number().int().nonnegative(), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("goal"), planId: z.string().min(1), revision: z.number().int().nonnegative(), goal: z.string().trim().min(3).max(2000), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
]);
export async function mutateFlow(userId: string, input: z.infer<typeof flowMutationSchema>, locale?: string) {
  let link: string | undefined;
  await prisma.$transaction(async raw => {
    const tx = raw as DB, found = await readPlan(userId, input.planId, tx);
    if (found.archivedAt || found.activeKey !== userId || !found.actions.some(a => flowStep(a))) throw new PlanWriteError("只可修改目前新版計畫 / Only the active new workflow can be changed", 409);
    if (input.action === "complete" && found.actions.some(a => flowStep(a)?.id === input.step && a.done)) return;
    await lockActivePlan(tx, userId, found.id, input.revision);
    const plan = await readPlan(userId, input.planId, tx), context = await flowContext(plan, tx);
    const current = STEPS.find(s => !plan.actions.find(a => a.clientKey === flowKey(s.id))?.done);
    if (input.action === "goal") {
      if (!plan.goalStartsAt || !Number.isFinite(Date.parse(input.deadline)) || new Date(input.deadline).toISOString().slice(0, 10) !== input.deadline || input.deadline <= today() || Date.parse(input.deadline) - plan.goalStartsAt.getTime() < 35 * 86400000) throw new PlanWriteError("請選擇有效未來日期，規劃至少 35 天 / Choose a valid future deadline with at least 35 days", 400);
      await tx.actionPlan.update({ where: { id: plan.id }, data: { goal: input.goal, goalDeadline: new Date(input.deadline) } });
      for (const [i, m] of flowMilestones(today(plan.goalStartsAt), input.deadline, plan.locale).entries()) {
        await tx.planMilestone.updateMany({ where: { actionPlanId: plan.id, position: i, achievedAt: null }, data: { targetDate: new Date(m.targetDate) } });
      }
      return;
    }
    if (input.action === "confirmLink") {
      const action = plan.actions.find(a => flowStep(a)?.id === "01-2");
      const data = dataAt(context, "01-2");
      if (current?.id !== "01-2" || !action || data.kind !== "organize" || !data.confirmed.includes("positioning") || !data.values.positioning?.trim() || !records(context).some(r => r.id === input.leadId)) throw new PlanWriteError("先儲存並確認定位，並選擇本計畫受訪者 / Save confirmed positioning and select a plan interviewee", 409);
      const token = randomBytes(32).toString("base64url"), old = metadata(action.taskFinding);
      const entry = { version: old.positioningVersion || "", leadId: input.leadId, hash: hash(token), statement: data.values.positioning, expires: new Date(Date.now() + 30 * 86400000).toISOString() };
      await tx.actionItem.update({ where: { id: action.id }, data: { taskFinding: { ...old, links: [...(old.links || []).filter(l => l.leadId !== input.leadId), entry] } as Prisma.InputJsonValue } });
      link = "/task-confirm/" + action.id + "?token=" + token;
      return;
    }
    if (input.action === "share") {
      const action = plan.actions.find(a => flowStep(a)?.id === "05-3");
      if (!action) throw new PlanWriteError("找不到報告 / Report not found", 404);
      const old = metadata(action.taskFinding);
      if (!input.enabled) { await tx.actionItem.update({ where: { id: action.id }, data: { taskFinding: { ...old, share: null } as Prisma.InputJsonValue } }); return; }
      if (current || flowView(context).some(s => !s.ready)) throw new PlanWriteError("全部 16 步與有效證據完成後才能分享 / Complete sixteen steps with valid evidence before sharing", 409);
      const token = randomBytes(32).toString("base64url");
      await tx.actionItem.update({ where: { id: action.id }, data: { taskFinding: { ...old, share: { hash: hash(token), expires: new Date(Date.now() + 30 * 86400000).toISOString(), fingerprint: reportFingerprint(plan, context) } } as Prisma.InputJsonValue } });
      link = "/task-report/" + action.id + "?token=" + token;
      return;
    }
    if (current?.id !== input.step) throw new PlanWriteError("一次只能操作目前一步；已完成紀錄保留 / Only the current step can be changed; completed records are retained", 409);
    const action = plan.actions.find(a => flowStep(a)?.id === input.step)!;
    for (const prior of STEPS.slice(0, STEPS.findIndex(s => s.id === current.id))) {
      const result = evaluateStep(context, prior.id);
      if (!result.ready) throw new PlanWriteError("前一步成果需補正 / Earlier evidence needs attention: " + prior.id + " · " + result.reasons.join("；"), 409);
    }
    if (input.action === "save") {
      if (input.data.kind !== current.kind) throw new PlanWriteError("表單類型與目前步驟不符 / Wrong template for the current step", 400);
      if(input.step === "01-1" && input.data.kind === "conversation") {
        const previous=flowStoredSchema.safeParse(action.taskWorkspace).data?.data,old=previous?.kind==="conversation"?previous.records:[];
        const workspace=await tx.evidenceWorkspace.findUnique({where:{userId}}),state=evidenceStateSchema.parse(workspace?.data||{});let updated=false;
        for(const r of input.data.records){const prior=old.find(v=>v.id===r.id);if((!prior || prior.fit!=null) && r.fit==null)throw new PlanWriteError("新增對話請選擇客群符合度 / Select customer fit for each new conversation",400);if(prior?.hypothesisId&&r.hypothesisId!==prior.hypothesisId)throw new PlanWriteError("原假設關聯不可覆寫 / Original hypothesis link cannot be overwritten",409);if(!prior&&state.selectedId){r.hypothesisId=state.selectedId;state.links.push({id:action.id+":"+r.id,hypothesisId:state.selectedId,fit:r.fit||"uncertain",relationship:["friend","colleague","stranger","prospect"].includes(r.relationship)?r.relationship as "friend"|"colleague"|"stranger"|"prospect":"prospect"});updated=true;}}
        if(workspace&&updated){evidenceStateSchema.parse(state);const moved=await tx.evidenceWorkspace.updateMany({where:{userId,revision:workspace.revision},data:{data:state as Prisma.InputJsonValue,revision:{increment:1}}});if(!moved.count)throw new PlanWriteError("假設已更新，對話草稿保留 / Hypothesis changed; conversation draft retained",409);}
      }
      const result = evaluateStep(context, input.step, input.data);
      const previous = flowStoredSchema.safeParse(action.taskWorkspace).data?.data;
      const changedPositioning = input.step === "01-2" && input.data.kind === "organize" && (previous?.kind !== "organize" || previous.values.positioning !== input.data.values.positioning);
      await tx.actionItem.update({ where: { id: action.id }, data: { taskWorkspace: { version: 2, step: input.step, data: input.data } as Prisma.InputJsonValue, ...(changedPositioning ? { taskFinding: { ...metadata(action.taskFinding), positioningVersion: randomBytes(16).toString("hex") } as Prisma.InputJsonValue } : {}), metricCurrent: result.current, metricTarget: result.target } });
      return;
    }
    const stored = flowStoredSchema.safeParse(action.taskWorkspace).data;
    if ((!stored || stored.step !== current.id) && input.step !== "02-2") throw new PlanWriteError("請先儲存目前步驟成果 / Save this step before completing it", 409);
    const result = evaluateStep(context, input.step);
    if (!result.ready) throw new PlanWriteError(result.reasons.join("；"), 409);
    await prepareActionReward(tx, userId, action.id, false);
    await tx.actionItem.update({ where: { id: action.id }, data: { ...(!stored ? { taskWorkspace: { version: 2, step: input.step, data: emptyFlowData(current.kind) } as Prisma.InputJsonValue } : {}), done: true, completedAt: new Date(), metricCurrent: result.current, metricTarget: result.target, taskFinding: { ...metadata(action.taskFinding), completionRequest: input.requestId, outcome: { step: input.step, at: new Date().toISOString(), summary: result.summary, sourceActions: STEPS.slice(0, STEPS.findIndex(s => s.id === input.step)).map(s => plan.actions.find(a => flowStep(a)?.id === s.id)!.id), proofIds: context.proofs.filter(p => p.approved && !p.revoked).map(p => p.id), ...(input.step === "04-3" ? { metrics: customerMetrics(context) } : {}), ...(input.step === "05-1" ? { weekly: weeklyTarget(context) } : {}) } } as Prisma.InputJsonValue } });
    if (STEPS.filter(s => s.milestone === current.milestone).at(-1)?.id === current.id) await tx.planMilestone.updateMany({ where: { actionPlanId: plan.id, position: current.milestone }, data: { achievedAt: new Date(), outcomeNote: result.summary.join("\n") || action.expectedOutcome } });
    if (input.step === "05-1") {
      const weekly = weeklyTarget(context), start = new Date(today() + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() + (8 - (start.getUTCDay() || 7)));
      const zh = plan.locale === "zh-tw";
      await tx.weekCalendarItem.createMany({ data: Array.from({ length: 13 }, (_, i) => ({ userId, kind: "personal", date: new Date(start.getTime() + i * 7 * 86400000), title: zh ? "第 " + (i + 1) + " 週：聯絡 " + weekly.weeklyContacts + " 家，對話 " + weekly.weeklyConversations + " 次" : "Week " + (i + 1) + ": " + weekly.weeklyContacts + " contacts, " + weekly.weeklyConversations + " conversations", note: (zh ? "來源：今日任務 05-1；季度目標 " : "Source: task 05-1; quarterly target ") + weekly.currency + " " + weekly.target, requestId: "nova-flow:" + plan.id + ":week:" + i })), skipDuplicates: true });
    }
    await completeGettingStarted(tx, userId);
    await awardReward(tx, userId, "action", action.id);
  }, { timeout: 15000 });
  return { ...(await getFlow(userId, input.planId, locale)), link };
}
export async function confirmation(actionId: string, token: string, answer?: "yes" | "no") {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) throw new PlanWriteError("連結無效或已失效 / Invalid or expired link", 404);
  const perform = async (tx: DB) => {
    const action = await tx.actionItem.findFirst({ where: { id: actionId, clientKey: flowKey("01-2"), actionPlan: { archivedAt: null, activeKey: { not: null } } }, include: { actionPlan: true } });
    const stored = flowStoredSchema.safeParse(action?.taskWorkspace).data, meta = metadata(action?.taskFinding);
    const entry = meta.links?.find(l => l.hash === hash(token) && l.version === meta.positioningVersion && Date.parse(l.expires) > Date.now());
    if (!action || !entry || stored?.data.kind !== "organize" || stored.data.values.positioning !== entry.statement) throw new PlanWriteError("連結無效、已更新或已失效 / Invalid, updated or expired link", 404);
    const response = meta.responses?.find(r => r.version === entry.version && r.leadId === entry.leadId && r.statement === entry.statement);
    if (answer && response && response.answer !== answer) throw new PlanWriteError("已保存回覆，不能覆寫 / Your response is already saved", 409);
    if (answer && !response) {
      if (action.done) throw new PlanWriteError("這個確認已結束 / This confirmation is closed", 409);
      await lockActivePlan(tx, action.actionPlan.userId, action.actionPlanId);
      const latest = await tx.actionItem.findUniqueOrThrow({ where: { id: action.id } });
      const next = metadata(latest.taskFinding), live = next.links?.find(l => l.hash === entry.hash);
      const current = flowStoredSchema.safeParse(latest.taskWorkspace).data;
      if (!live || live.version !== next.positioningVersion || latest.done || current?.data.kind !== "organize" || current.data.values.positioning !== entry.statement) throw new PlanWriteError("定位已更新，請索取新連結 / Positioning changed; request a new link", 409);
      const prior = next.responses?.find(r => r.version === entry.version && r.leadId === entry.leadId && r.statement === entry.statement);
      if (prior && prior.answer !== answer) throw new PlanWriteError("已保存回覆，不能覆寫 / Your response is already saved", 409);
      if (!prior) await tx.actionItem.update({ where: { id: action.id }, data: { taskFinding: { ...next, responses: [...(next.responses || []), { version: entry.version, leadId: entry.leadId, statement: entry.statement, answer, at: new Date().toISOString() }] } as Prisma.InputJsonValue } });
    }
    return { statement: entry.statement, locale: action.actionPlan.locale, answered: Boolean(answer || response) };
  };
  return answer ? prisma.$transaction(tx => perform(tx as DB)) : perform(prisma as unknown as DB);
}
export async function reportAccess(actionId: string, userId?: string, token?: string) {
  const action = await prisma.actionItem.findFirst({ where: { id: actionId, clientKey: { in: [flowKey("03-3"), flowKey("05-3")] } } });
  if (!action) throw new PlanWriteError("找不到文件 / Document not found", 404);
  const plan = await prisma.actionPlan.findUniqueOrThrow({ where: { id: action.actionPlanId }, include }), context = await flowContext(plan);
  if (plan.userId !== userId || token) {
    const share = metadata(action.taskFinding).share;
    if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token) || !share || share.hash !== hash(token) || Date.parse(share.expires) <= Date.now() || plan.archivedAt || !action.done || share.fingerprint !== reportFingerprint(plan, context) || flowView(context).some(s => !s.ready || !s.done)) throw new PlanWriteError("分享未開啟、已更新或已失效 / Sharing is disabled, updated or expired", 404);
  }
  const stored = flowStoredSchema.safeParse(action.taskWorkspace).data;
  if (stored?.data.kind !== "document") throw new PlanWriteError("請先儲存文件 / Save the document first", 409);
  return { version: reportFingerprint(plan, context).slice(0, 12), counts: { conversations: records(context).length, companies: new Set(records(context).map(r => r.company.normalize("NFKC").toLowerCase())).size, payments: paidCompanies(context).length }, shareExpires: metadata(action.taskFinding).share?.expires || null, step: flowStep(action)!.id, completedAt: action.completedAt?.toISOString() || null, sections: [...stored.data.sections].sort((a, b) => Number(a.id) - Number(b.id)), locale: plan.locale, title: action.title, goal: plan.goal || "", code: "NV-" + hash(plan.id).slice(0, 4).toUpperCase() + "-" + hash(plan.id).slice(4, 8).toUpperCase() };
}
