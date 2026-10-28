import { workspaceKind, interviewTarget } from "@/lib/action-plan/workspace";
import { readIcp } from "@/lib/icp/schema";
import { excludeKnownCompanies, prospectCacheSchema, prospectCacheFresh, prospectKey } from "./prospect-schema";
import { interviewSummary } from "@/lib/customer-insights/interviews";
import { interviewRows } from "@/lib/customer-insights/service";
import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PlanWriteError, lockActivePlan } from "@/lib/action-plan/service";
import { insightSchema } from "@/lib/customer-insights/schema";
import { companyKey } from "@/lib/customer-insights/interviews";
import { commitmentSummary, commercialStateSchema, commercialTask, commercialTarget, priorityCompanies, salesRecordSchema, sameScope, type Scope, type SalesMutation } from "./schema";

type DB = Prisma.TransactionClient;
export async function validationScope(tx: DB, userId: string, scope: Scope, lock = false) {
  if (scope.planId) {
    if (lock) await lockActivePlan(tx, userId, scope.planId);
    const plan = await tx.actionPlan.findFirst({ where: { id: scope.planId, userId, activeKey: userId, archivedAt: null }, include: { actions: true } });
    if (!plan) throw new PlanWriteError("找不到目前計畫 / Active plan not found", 404);
    const source = plan.sourceJourneyId ? await tx.discoveryJourney.findFirst({ where: { id: plan.sourceJourneyId, userId } }) : null;
    return { plan, journey: source, actions: plan.actions, cache: plan.validationAnalysis };
  }
  if (lock) {
    const active = await tx.actionPlan.findFirst({ where: { userId, activeKey: userId }, select: { id: true } });
    if (active) await lockActivePlan(tx, userId, active.id);
  }
  if (lock) await tx.$queryRaw`SELECT "id" FROM "DiscoveryJourney" WHERE "id" = ${scope.journeyId!} AND "userId" = ${userId} FOR UPDATE`;
  const journey = await tx.discoveryJourney.findFirst({ where: { id: scope.journeyId, userId } });
  if (!journey) throw new PlanWriteError("找不到訪談工作區 / Interview workspace not found", 404);
  return { plan: null, journey, actions: [], cache: journey.validationAnalysis };
}
export async function validationRows(tx: DB, userId: string, scope: Scope) {
  const context = await validationScope(tx, userId, scope);
  const ids = new Set(context.actions.map(a => a.id));
  const all = await tx.meetingNote.findMany({ where: { userId, insight: { not: Prisma.DbNull } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, updatedAt: true, insight: true } });
  const rows = all.filter(r => { const v = insightSchema.safeParse(r.insight).data; return v && ((v.actionId && ids.has(v.actionId)) || (v.journeyId && v.journeyId === context.journey?.id)); });
  return { ...context, rows };
}
export async function validationDeals(tx: DB, userId: string, scope: Scope) {
  const source = scope.planId ? await tx.actionPlan.findFirst({ where: { id: scope.planId, userId }, select: { sourceJourneyId: true } }) : null;
  const deals = await tx.deal.findMany({ where: { userId, validation: { not: Prisma.DbNull } }, orderBy: { createdAt: "asc" } });
  return deals.flatMap(deal => { const record = salesRecordSchema.safeParse(deal.validation).data; return record && (sameScope(record.scope, scope) || (source?.sourceJourneyId && record.scope.journeyId === source.sourceJourneyId)) ? [{ ...deal, record }] : []; });
}
export function sourceFingerprint(rows: { id: string; updatedAt: Date | string; insight: unknown }[]) {
  return createHash("sha256").update(JSON.stringify(rows.map(r => [r.id, new Date(r.updatedAt).toISOString(), r.insight]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest("hex");
}
// Read legacy insight JSON too: incomplete/older notes must still exclude an existing company.
export async function prospectContext(tx: DB, userId: string, scope: Scope) {
  const [context, profile, notes, contacts, deals] = await Promise.all([
    validationRows(tx, userId, scope), tx.onboardingProfile.findUnique({ where: { userId } }),
    tx.meetingNote.findMany({ where: { userId }, select: { insight: true } }),
    tx.contact.findMany({ where: { userId }, select: { company: true } }),
    tx.deal.findMany({ where: { userId }, select: { title: true, validation: true } }),
  ]);
  let ownWebsite = ""; try { ownWebsite = new URL(profile?.website || "").origin; } catch { /* A missing website does not block discovery. */ }
  const excluded = [...new Set([
    profile?.companyName || "", ownWebsite, ...notes.map(n => (n.insight as { company?: unknown } | null)?.company).filter((v): v is string => typeof v === "string"),
    ...contacts.map(c => c.company || ""), ...deals.flatMap(d => { const record = salesRecordSchema.safeParse(d.validation).data; return [d.title, record?.company || "", ...(record?.prospect ? [record.prospect.name, ...record.prospect.aliases, record.prospect.website] : [])]; }),
  ].filter(Boolean))].sort();
  const icp = readIcp(profile?.icpDetails);
  const criteria = { product: profile?.oneLinePitch || "", industry: profile?.industry || "", customer: icp?.who || "", customerStage: icp?.stage || "", customerLocation: icp?.location || "", problem: icp?.problem || "", summary: icp?.summary || profile?.icp || "", market: "Taiwan" };
  const source = sourceFingerprint([{ id: "prospects-contact-v9", updatedAt: "2026-10-24T00:00:00Z", insight: { criteria, excluded } }]);
  return { ...context, criteria, excluded, prospectSource: source };
}
export async function currentProspects(tx: DB, userId: string, scope: Scope) {
  const context = await prospectContext(tx, userId, scope), cache = prospectCacheSchema.safeParse(context.cache).data;
  return Object.fromEntries(Object.entries(cache?.prospects || {}).map(([key, entry]) => {
    const checked = entry.result.contactChecked && prospectCacheFresh(entry.result.generatedAt);
    return [key, { ...entry.result, stale: entry.source !== context.prospectSource || !checked, companies: checked ? excludeKnownCompanies(entry.result.companies.filter(c => c.contact), context.excluded) : [] }];
  }));
}
export async function validationSnapshot(userId: string, scope: Scope) {
  const tx = prisma as unknown as DB;
  const [context, deals, contacts] = await Promise.all([validationRows(tx, userId, scope), validationDeals(tx, userId, scope), tx.contact.findMany({ where: { userId }, select: { id: true, name: true, company: true } })]);
  const records = deals.map(d => d.record), summary = commitmentSummary(records);
  const ownJourney = scope.planId && !context.plan?.sourceJourneyId ? await tx.discoveryJourney.findUnique({ where: { userId }, select: { id: true } }) : null;
  return { scope, rows: context.rows, source: sourceFingerprint(context.rows), analysis: context.cache, prospects: await currentProspects(tx, userId, scope), summary, priority: priorityCompanies(context.rows, contacts, records),
    deals: deals.map(d => ({ id: d.id, contactId: d.contactId, ...d.record })),
    sourceJourneyId: context.plan?.sourceJourneyId ?? null, availableJourneyId: ownJourney?.id ?? null,
    revision: context.plan?.revision ?? null,
    tasks: context.actions.filter(a => commercialTask(a)).map(a => ({ id: a.id, title: a.title, target: commercialTarget(a), current: summary.total, done: a.done, historicalUnverified: a.done && !a.commercialValidation, needsConfirmation: a.done && (!commercialStateSchema.safeParse(a.commercialValidation).data?.confirmedAt || commercialStateSchema.safeParse(a.commercialValidation).data?.requiresConfirmation || summary.total < commercialTarget(a)) })),
  };
}
export async function refreshCommercialProgress(tx: DB, userId: string, scope: Scope) {
  const context = await validationScope(tx, userId, scope), deals = await validationDeals(tx, userId, scope);
  const summary = commitmentSummary(deals.map(d => d.record));
  for (const action of context.actions.filter(a => commercialTask(a))) {
    if (action.done && !action.commercialValidation) continue; // Historical completions and their points are retained.
    await tx.actionItem.update({ where: { id: action.id }, data: {
      metricCurrent: summary.total, metricTarget: commercialTarget(action), metricUnit: "companies",
      ...(action.done && summary.total < commercialTarget(action) ? { commercialValidation: { requiresConfirmation: true } } : {}),
    } });
  }
}
export async function assertCommercialCompletion(tx: DB, userId: string, action: { id: string; actionPlanId: string; title: string; taskWorkspace?: unknown; metricTarget?: number | null; expectedOutcome?: string }) {
  const deals = await validationDeals(tx, userId, { planId: action.actionPlanId });
  const total = commitmentSummary(deals.map(d => d.record)).total, target = commercialTarget(action);
  if (total < target) throw new PlanWriteError(`需有效付款或付費合約證據 ${total}/${target}；口頭 Yes 不計 / Valid payment or paid-contract evidence required`, 409);
  await tx.actionItem.update({ where: { id: action.id }, data: { metricCurrent: total, metricTarget: target, metricUnit: "companies", commercialValidation: { requiresConfirmation: false, confirmedAt: new Date().toISOString() } } });
}
export async function assertCommercialPrerequisites(tx: DB, userId: string, planId: string, dependencyIds: string[]) {
  const all = await tx.actionItem.findMany({ where: { actionPlanId: planId }, include: { dependencies: { select: { dependsOnId: true } } } });
  const ancestors = new Set(dependencyIds);
  for (let changed = true; changed;) { changed = false; for (const action of all) if (ancestors.has(action.id)) for (const edge of action.dependencies) if (!ancestors.has(edge.dependsOnId)) { ancestors.add(edge.dependsOnId); changed = true; } }
  const previous = all.filter(a => ancestors.has(a.id));
  const total = commitmentSummary((await validationDeals(tx, userId, { planId })).map(d => d.record)).total;
  if (previous.some(a => commercialTask(a) && (total < commercialTarget(a) || (a.done && (!commercialStateSchema.safeParse(a.commercialValidation).data?.confirmedAt || commercialStateSchema.safeParse(a.commercialValidation).data?.requiresConfirmation))))) throw new PlanWriteError("付費成果已撤銷，請先重新確認有效證據 / Prior commercial evidence was revoked; reconfirm it before continuing", 409);
}
export async function saveSalesRecord(userId: string, input: SalesMutation) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    const context = await validationScope(tx, userId, input.scope, true);
    const id = `validation_${createHash("sha256").update(`${userId}:${input.scope.planId || input.scope.journeyId}:${companyKey(input.company)}`).digest("hex")}`;
    // Scope lock serialises deterministic company IDs, including retries from different tabs.
    const existing = await tx.deal.findFirst({ where: { id, userId } });
    const previous = salesRecordSchema.safeParse(existing?.validation).data;
    const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const replay = previous?.events.find(e => e.requestId === input.requestId);
    if (replay) { if (replay.payloadHash !== payloadHash) throw new PlanWriteError("這次提交已儲存不同內容，請比較紀錄再重試 / Request already saved with different content", 409); return id; }
    if ((previous?.version || 0) !== input.version) throw new PlanWriteError("另一分頁已更新公司，輸入保留；請比較最新紀錄後重試 / Company changed in another tab; compare the latest version and retry", 409);
    if (input.contactId && !await tx.contact.findFirst({ where: { id: input.contactId, userId } })) throw new PlanWriteError("找不到聯絡人 / Contact not found", 404);
    if (input.sourceId) {
      const context = await validationRows(tx, userId, input.scope);
      if (!context.rows.some(r => r.id === input.sourceId && companyKey(insightSchema.parse(r.insight).company) === companyKey(input.company))) throw new PlanWriteError("訪談來源不屬於這間公司或工作區 / Invalid interview source", 400);
    }
    const proofs = [...(previous?.proofs || [])];
    if (input.proof) {
      const existingProofs = await tx.deal.findMany({ where: { userId, validation: { not: Prisma.DbNull } }, select: { validation: true } });
      if (existingProofs.some(d => salesRecordSchema.safeParse(d.validation).data?.proofs.some(p => p.id === input.proof!.id || p.pathname === input.proof!.pathname))) throw new PlanWriteError("此證據已儲存，不可重複計入 / Evidence already saved; cannot count it twice", 409);
      if (proofs.some(p => p.id === input.proof!.id)) throw new PlanWriteError("證據識別碼已使用 / Evidence ID already used", 409);
      proofs.push(input.proof);
    }
    if (input.revoke) {
      const proof = proofs.find(p => p.id === input.revoke!.id);
      if (!proof || proof.revokedAt) throw new PlanWriteError("找不到有效證據 / Active evidence not found", 404);
      proof.revokedAt = new Date().toISOString(); proof.revokeReason = input.revoke.reason;
    }
    if ((input.status === "signed" || input.status === "paid") && !proofs.some(p => p.kind === input.status && !p.revokedAt)) throw new PlanWriteError("請先提供正數金額、日期與私密證明附件並確認 / Positive amount, date, private proof and confirmation required", 400);
    const candidate = Object.values(prospectCacheSchema.safeParse(context.cache).data?.prospects || {}).filter(entry => entry.result.contactChecked && prospectCacheFresh(entry.result.generatedAt)).flatMap(entry => entry.result.companies).find(c => c.contact && [c.name, ...c.aliases].some(name => prospectKey(name) === prospectKey(input.company)));
    const prospect = previous?.prospect || (candidate ? { name: candidate.name, aliases: candidate.aliases, website: candidate.website } : undefined);
    const record = salesRecordSchema.parse({ scope: input.scope, company: input.company, name: input.name, sourceId: input.sourceId || previous?.sourceId, version: (previous?.version || 0) + 1, status: input.status, proofs, prospect,
      events: [...(previous?.events || []), { requestId: input.requestId, payloadHash, at: new Date().toISOString(), status: input.status, quote: input.quote, reason: input.reason, amount: input.amount, currency: input.currency }], scripts: input.scripts || previous?.scripts,

    });
    const data = { stage: input.status === "signed" || input.status === "paid" ? "won" : input.status === "declined" ? "lost" : input.status === "quoted" || input.status === "considering" ? "proposal" : "contacted", title: input.company, contactId: input.contactId || existing?.contactId || null, validation: record as Prisma.InputJsonValue };
    await tx.deal.upsert({ where: { id }, create: { ...data, id, userId }, update: data });
    await refreshCommercialProgress(tx, userId, input.scope);
    if (process.env.MEMBER_NETWORK_ENABLED === "true") await (await import("@/lib/network/watches")).evaluateWatches(tx, userId);
    // A journey may already feed a plan; update that plan's counts using the same canonical rows.
    if (input.scope.journeyId) {
      const plans = await tx.actionPlan.findMany({ where: { userId, activeKey: userId, sourceJourneyId: input.scope.journeyId } });
      for (const plan of plans) { await lockActivePlan(tx, userId, plan.id); await refreshCommercialProgress(tx, userId, { planId: plan.id }); }
    }
    return id;
  });
}
export async function linkJourney(userId: string, planId: string, journeyId: string, revision: number) {
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    await lockActivePlan(tx, userId, planId, revision);
    const journey = await tx.discoveryJourney.findFirst({ where: { id: journeyId, userId } });
    if (!journey) throw new PlanWriteError("找不到自己的訪談工作區 / Workspace not found", 404);
    const plan = await tx.actionPlan.findUniqueOrThrow({ where: { id: planId } });
    if (plan.sourceJourneyId && plan.sourceJourneyId !== journeyId) throw new PlanWriteError("既有來源不可覆寫 / Existing source cannot be overwritten", 409);
    await tx.actionPlan.update({ where: { id: planId }, data: { sourceJourneyId: journeyId } });
    const actions = await tx.actionItem.findMany({ where: { actionPlanId: planId, done: false } });
    for (const action of actions) if (workspaceKind(action) === "interview") {
      const target = interviewTarget(action);
      if (target) await tx.actionItem.update({ where: { id: action.id }, data: { recordingMode: "interview", metricTarget: target, metricCurrent: interviewSummary(action.id, await interviewRows(tx, userId, action.id)).total, metricUnit: "companies" } });
    }
    await refreshCommercialProgress(tx, userId, { planId });
    if (process.env.MEMBER_NETWORK_ENABLED === "true") await (await import("@/lib/network/watches")).evaluateWatches(tx, userId);
  });
}
