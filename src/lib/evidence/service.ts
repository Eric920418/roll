import { today } from '@/lib/roadmap/schema';
import { nextWeeklyAt } from '@/lib/rewards/policy';
import { weekKey } from "@/lib/network/policy";
import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { changed, MemberError } from '@/lib/member-http';
import { insightSchema } from '@/lib/customer-insights/schema';
import { flowStoredSchema } from '@/lib/action-plan/flow/catalog';
import { salesRecordSchema } from '@/lib/validation/schema';
import { discoveryStateSchema } from '@/lib/icp/discovery';
import { anonymousCohortAverage, evidenceStateSchema, evidencePolicySchema, evaluateEvidence, type EvidenceSource, type EvidenceState, type evidenceMutationSchema } from './schema';
import { z } from 'zod';
type DB = Prisma.TransactionClient;
type EvidenceSnapshot = {
    cohort: ReturnType<typeof anonymousCohortAverage>;
    weekConversations: number;
    weekly: Awaited<ReturnType<typeof weeklyEvidence>>;
    analysisPending: boolean;
    state: EvidenceState;
    revision: number;
    sources: EvidenceSource[];
    result: ReturnType<typeof evaluateEvidence>;
    policy: z.infer<typeof evidencePolicySchema>;
    candidates: NonNullable<z.infer<typeof discoveryStateSchema>['result']>['candidates'];
    clarification: string | null;
    icpRevision: number;
};
const companyKey = (value: string) => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
export async function evidenceSources(userId: string, db: DB = prisma as unknown as DB) {
    const [notes, actions, deals] = await Promise.all([db.meetingNote.findMany({ where: { userId }, select: { id: true, insight: true } }), db.actionItem.findMany({ where: { actionPlan: { userId, activeKey: userId, archivedAt: null } }, select: { id: true, taskWorkspace: true } }), db.deal.findMany({ where: { userId, validation: { not: Prisma.DbNull } }, select: { validation: true } })]);
    const sources: EvidenceSource[] = [];
    for (const n of notes) {
        const v = insightSchema.safeParse(n.insight).data;
        if (v && v.stage !== 'angel_round' && !['Internal', 'Mentor', 'Industry expert', 'Advisor'].includes(v.type) && v.company && (!v.date || v.date <= today()) && (v.answers.some(Boolean) || v.notes))
            sources.push({ id: n.id, company: v.company, name: v.name, pain: v.commercial?.quote || v.notes || v.answers[v.stage === 'mvp' ? 3 : v.stage === 'first_sales' ? 2 : 1] || '', quote: v.commercial?.quote || v.notes || v.answers[v.stage === 'mvp' ? 3 : v.stage === 'first_sales' ? 2 : 1] || '', date: v.date, href: '/dashboard/insights' });
    }
    for (const a of actions) {
        const v = flowStoredSchema.safeParse(a.taskWorkspace).data;
        if (v?.step === '01-1' && v.data.kind === 'conversation')
            for (const r of v.data.records)
                if (r.company && r.name && r.pain && r.date && r.date <= today())
                    sources.push({ id: a.id + ':' + r.id, company: r.company, name: r.name, pain: r.pain, quote: r.quote || r.pain, date: r.date, href: '/dashboard/agenda#action-' + a.id });
    }
    const payments = deals.flatMap(d => { const v = salesRecordSchema.safeParse(d.validation).data; return v ? v.proofs.filter(p => !p.revokedAt && p.review?.status === 'approved' && p.date <= today()).map(p => ({ id: p.id, company: v.company, kind: p.kind, date: p.date })) : []; });
    return { sources, payments };
}
export async function evidencePolicy(db: DB = prisma as unknown as DB) { const row = await db.setting.findUnique({ where: { key: 'novaEvidencePolicy' } }); return evidencePolicySchema.parse(row?.value || {}); }
export const topicAnalysisSchema = z.object({ requestId: z.string(), hash: z.string(), since: z.string(), status: z.string(), sourceHash: z.string(), usageId: z.string().nullable().optional(), topics: z.array(z.object({ title: z.string().min(1).max(500), sourceIds: z.array(z.string()).min(1).max(500) })).optional() });
export function evidenceFingerprint(state: EvidenceState, sources: EvidenceSource[]) { return createHash('sha256').update(JSON.stringify([state.selectedId, state.links, sources])).digest('hex'); }
export async function evidenceSnapshot(userId: string, attempt = 0): Promise<EvidenceSnapshot> {
    const [row, input, policy, icp] = await Promise.all([prisma.evidenceWorkspace.findUnique({ where: { userId } }), evidenceSources(userId), evidencePolicy(), prisma.icpWorkspace.findUnique({ where: { userId }, select: { discovery: true, revision: true } })]);
    const state = evidenceStateSchema.parse(row?.data || {}), selectedCompanies = new Set(input.sources.filter(s => state.links.some(l => l.id === s.id && l.hypothesisId === state.selectedId && l.fit !== 'no')).map(s => companyKey(s.company)));
    const paid = new Set(input.payments.filter(p => selectedCompanies.has(companyKey(p.company))).map(p => companyKey(p.company))).size;
    const analysis = topicAnalysisSchema.safeParse(row?.analysis).data;
    const topics = analysis?.status === 'completed' && analysis.sourceHash === evidenceFingerprint(state, input.sources) ? analysis.topics : undefined;
    const result = evaluateEvidence(state, input.sources, paid, policy, topics);
    const week = weekKey(), weeklySources = input.sources.filter(s => s.date >= week && state.links.some(l => l.id === s.id && l.hypothesisId === state.selectedId && ['yes', 'possible'].includes(l.fit)));
    const stats = { week, conversations: result.conversations, weekConversations: new Set(weeklySources.map(s => (s.company + '|' + s.name).normalize('NFKC').toLowerCase())).size, paid: result.paid, stage: result.stage };
    let revision = row?.revision || 0, projected = state;
    if (row && (result.stage > state.maxStage || JSON.stringify(state.stats) !== JSON.stringify(stats))) {
        projected = { ...state, stats, maxStage: result.stage };
        const saved = await prisma.evidenceWorkspace.updateMany({ where: { userId, revision: row.revision }, data: { data: projected as Prisma.InputJsonValue, revision: { increment: 1 } } });
        if (!saved.count) {
            if (attempt >= 2)
                throw changed();
            return evidenceSnapshot(userId, attempt + 1);
        }
        revision++;
    }
    const cohortRows = await prisma.evidenceWorkspace.findMany({ where: { userId: { not: userId }, AND: [{ data: { path: ['preferences', 'benchmarkShare'], equals: true } }, { data: { path: ['stats', 'stage'], equals: result.stage } }, { data: { path: ['stats', 'week'], equals: week } }], user: { email: { not: { endsWith: '.invalid' } } } }, select: { data: true } });
    const cohortStats = cohortRows.flatMap(r => evidenceStateSchema.safeParse(r.data).data?.stats || []);
    const cohort = anonymousCohortAverage(cohortStats.map(v => v.weekConversations));
    const discovery = discoveryStateSchema.safeParse(icp?.discovery).data?.result;
    const candidates = discovery?.candidates || [];
    return { weekly: await weeklyEvidence(userId), cohort, weekConversations: stats.weekConversations, analysisPending: analysis?.status === 'processing' && Date.now() - Date.parse(analysis.since) < 120000, state: projected, revision, sources: input.sources, result, policy, candidates, clarification: discovery?.question || null, icpRevision: icp?.revision || 0 };
}
export async function mutateEvidence(userId: string, input: z.infer<typeof evidenceMutationSchema>) {
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    await prisma.$transaction(async (raw) => {
        const db = raw as DB;
        await db.$queryRaw `SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
        const row = await db.evidenceWorkspace.upsert({ where: { userId }, create: { userId }, update: {} });
        if (row.lastRequestId === input.requestId) {
            if (row.lastRequestHash !== hash)
                throw changed();
            return;
        }
        if (row.revision !== input.revision)
            throw changed();
        const state: EvidenceState = evidenceStateSchema.parse(row.data);
        if (input.action === 'preferences') {
            if (!input.preferences)
                throw new MemberError('缺少通知偏好 / Missing preferences', 400);
            state.preferences = { ...input.preferences, acceptMessages: input.preferences.acceptMessages ?? state.preferences.acceptMessages };
            state.preferenceVersion++;
            state.nextWeeklyAt = input.preferences.weekly ? nextWeeklyAt(input.preferences.timeZone).toISOString() : null;
        }
        else if (input.action === 'save') {
            if (input.hypothesis) {
                const old = state.hypotheses.find(h => h.id === input.hypothesis!.id);
                if (old && state.selections.some(s => s.id === old.id) && JSON.stringify(old) !== JSON.stringify(input.hypothesis))
                    throw new MemberError('已使用的假設不可覆寫，請另建版本 / Create a new version of a previously selected hypothesis', 409);
                state.hypotheses = [...state.hypotheses.filter(h => h.id !== input.hypothesis!.id), input.hypothesis];
            }
            if (input.links) {
                const { sources } = await evidenceSources(userId, db);
                for (const l of input.links)
                    if (!sources.some(s => s.id === l.id) || !state.hypotheses.some(h => h.id === l.hypothesisId))
                        throw new MemberError('佐證不存在或不屬於本人 / Evidence unavailable or not owned', 400);
                const keys = new Set(input.links.map(l => l.id + '|' + l.hypothesisId));
                state.links = [...state.links.filter(l => !keys.has(l.id + '|' + l.hypothesisId)), ...input.links];
            }
        }
        else {
            if (!input.selectedId || !state.hypotheses.some(h => h.id === input.selectedId))
                throw new MemberError('請先儲存目標客戶假設 / Save a hypothesis first', 400);
            if (state.selectedId && state.selectedId !== input.selectedId && await db.actionPlan.findFirst({ where: { userId, activeKey: userId, archivedAt: null, actions: { some: { OR: [{ done: true }, { taskWorkspace: { not: Prisma.DbNull } }] } } }, select: { id: true } }))
                throw new MemberError('目前計畫已有成果；更換客群請先建立新目標計畫，舊計畫與完成紀錄會保留 / This plan has saved results. Create a new goal plan before changing customers; old plans and completion history are preserved', 409);
            if (state.selectedId !== input.selectedId) {
                state.selections.push({ id: input.selectedId, at: new Date().toISOString(), previousId: state.selectedId });
                state.selectedId = input.selectedId;
                state.maxStage = 2;
            }
        }
        evidenceStateSchema.parse(state);
        await db.evidenceWorkspace.update({ where: { userId }, data: { data: state as Prisma.InputJsonValue, revision: { increment: 1 }, lastRequestId: input.requestId, lastRequestHash: hash } });
    });
    return evidenceSnapshot(userId);
}
export async function weeklyEvidence(userId: string, now = new Date(), db: DB = prisma as unknown as DB) {
    const { sources, payments } = await evidenceSources(userId, db), week = weekKey(now), state = evidenceStateSchema.parse((await db.evidenceWorkspace.findUnique({ where: { userId } }))?.data || {});
    const rows = sources.filter(s => s.date >= week && s.date <= today(now) && state.links.some(l => l.id === s.id && l.hypothesisId === state.selectedId && ['yes', 'possible'].includes(l.fit))), companies = new Set(sources.filter(s => state.links.some(l => l.id === s.id && l.hypothesisId === state.selectedId && ['yes', 'possible'].includes(l.fit))).map(s => companyKey(s.company)));
    return { week, stage: state.maxStage, conversations: new Set(rows.map(s => companyKey(s.company + '|' + s.name))).size, findings: new Set(rows.map(s => s.pain)).size, commitments: new Set(payments.filter(p => p.date >= week && p.date <= today(now) && companies.has(companyKey(p.company))).map(p => companyKey(p.company))).size };
}
