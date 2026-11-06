import { today } from '@/lib/roadmap/schema';
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MemberError } from '@/lib/member-http';
import { evidenceStateSchema } from './schema';
import { evidenceSnapshot, weeklyEvidence } from './service';
import { queueNotification } from '@/lib/network/notifications';
import { nextWeeklyAt } from '@/lib/rewards/policy';
import { flowStoredSchema } from '@/lib/action-plan/flow/catalog';
export type EvidenceCategory = 'weekly' | 'task' | 'roundtable' | 'connection';
export function evidenceToken(userId: string, version: number, category: EvidenceCategory) {
    if (!process.env.AUTH_SECRET)
        throw new MemberError('通知簽章設定缺失 / Signing unavailable', 503);
    const value = [userId, version, category].join('.'), sig = createHmac('sha256', process.env.AUTH_SECRET).update('evidence-email:' + value).digest('hex');
    return value + '.' + sig;
}
export function readEvidenceToken(token: string) {
    const [userId, version, category, sig, extra] = token.split('.');
    if (extra || !/^[A-Za-z0-9_-]{1,100}$/.test(userId || '') || !/^\d{1,9}$/.test(version || '') || !['weekly', 'task', 'roundtable', 'connection'].includes(category) || !/^\w{64}$/.test(sig || ''))
        throw new MemberError('退訂連結無效 / Invalid unsubscribe link', 400);
    const expected = evidenceToken(userId, Number(version), category as EvidenceCategory).split('.').at(-1)!;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
        throw new MemberError('退訂連結無效 / Invalid unsubscribe link', 400);
    return { userId, version: Number(version), category: category as EvidenceCategory };
}
export async function unsubscribeEvidence(token: string) {
    const value = readEvidenceToken(token);
    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "User" WHERE "id"=${value.userId} FOR UPDATE`;
        const row = await tx.evidenceWorkspace.findUnique({ where: { userId: value.userId } }), state = evidenceStateSchema.parse(row?.data || {});
        if (!row || state.preferenceVersion !== value.version)
            throw new MemberError('退訂連結已失效 / Unsubscribe link expired', 400);
        state.preferences[value.category] = false;
        await tx.evidenceWorkspace.update({ where: { userId: value.userId }, data: { data: state as Prisma.InputJsonValue, revision: { increment: 1 } } });
    });
    return { saved: true };
}
export async function evidenceEmailAllowed(userId: string, category: EvidenceCategory, version?: number) { const row = await prisma.evidenceWorkspace.findUnique({ where: { userId } }), state = evidenceStateSchema.parse(row?.data || {}); return { enabled: Boolean(row && state.preferences[category] && (version == null || version === state.preferenceVersion)), state }; }
export async function ensurePreparations(now = new Date()) {
    const rows = await prisma.roundtableRegistration.findMany({ where: { status: 'confirmed', preparation: { equals: Prisma.DbNull }, roundtable: { status: 'scheduled', startsAt: { gt: now, lte: new Date(now.getTime() + 86400000) }, host: { mentorCertification: { status: 'approved' } } } }, take: 100 });
    for (const row of rows) {
        const summary = await weeklyEvidence(row.userId, now);
        await prisma.roundtableRegistration.updateMany({ where: { id: row.id, status: 'confirmed', preparation: { equals: Prisma.DbNull } }, data: { preparation: { ...summary, share: false, generatedAt: now.toISOString() } } });
    }
    return rows.length;
}
async function notify(userId: string, eventKey: string, category: EvidenceCategory, titleZh: string, titleEn: string, payload: Record<string, Prisma.InputJsonValue> = {}) { const { state } = await evidenceEmailAllowed(userId, category); return queueNotification(prisma as unknown as Prisma.TransactionClient, userId, eventKey, 'evidence', { ...payload, category, titleZh, titleEn, preferenceVersion: state.preferenceVersion }, state.preferences[category]); }
export async function runEvidenceReminders(now = new Date()) {
    const prepared = await ensurePreparations(now), rows = await prisma.evidenceWorkspace.findMany({ select: { userId: true, data: true, revision: true } });
    let queued = 0;
    for (const row of rows) {
        const state = evidenceStateSchema.parse(row.data);
        if (state.preferences.weekly) {
            if (!state.nextWeeklyAt) {
                await prisma.evidenceWorkspace.updateMany({ where: { userId: row.userId, revision: row.revision }, data: { data: { ...state, nextWeeklyAt: nextWeeklyAt(state.preferences.timeZone, now).toISOString() } as Prisma.InputJsonValue, revision: { increment: 1 } } });
            }
            else if (Date.parse(state.nextWeeklyAt) <= now.getTime()) {
                const summary = await weeklyEvidence(row.userId, now), snapshot = await evidenceSnapshot(row.userId), current = snapshot.state;
                await prisma.$transaction(async (tx) => {
                    if (!current.preferences.weekly || !current.nextWeeklyAt || Date.parse(current.nextWeeklyAt) > now.getTime())
                        return;
                    const moved = await tx.evidenceWorkspace.updateMany({ where: { userId: row.userId, revision: snapshot.revision }, data: { data: { ...current, nextWeeklyAt: nextWeeklyAt(current.preferences.timeZone, now).toISOString() } as Prisma.InputJsonValue, revision: { increment: 1 } } });
                    if (moved.count) {
                        await queueNotification(tx as unknown as Prisma.TransactionClient, row.userId, `evidence-week:${row.userId}:${current.nextWeeklyAt}`, 'evidence', { category: 'weekly', titleZh: `本週最重要的一件事 · ${summary.conversations} 次客戶對話`, titleEn: `Your priority this week · ${summary.conversations} customer conversations`, conversations: summary.conversations, stage: snapshot.result.stage, preferenceVersion: current.preferenceVersion }, true);
                        queued++;
                    }
                });
            }
        }
        if (state.preferences.task) {
            const plan = await prisma.actionPlan.findFirst({ where: { userId: row.userId, activeKey: row.userId, archivedAt: null }, include: { actions: { orderBy: { executionOrder: 'asc' } }, milestones: true } });
            const action = plan?.actions.find(a => !a.done);
            if (action && plan) {
                const stored = flowStoredSchema.safeParse(action.taskWorkspace).data, contacts = stored?.data.kind === 'outreach' ? stored.data.contacts : [];
                for (const c of contacts.filter(c => c.status === 'sent' && c.date && c.date <= today(new Date(now.getTime() - 7 * 86400000)))) {
                    await notify(row.userId, `evidence-followup:${action.id}:${c.id}:${c.date}`, 'task', '七天未回覆，記得安排跟進', 'Seven days without a reply: plan a follow-up', { actionId: action.id, planId: plan.id, contactId: c.id, contactDate: c.date });
                    queued++;
                }
                const milestone = plan.milestones.find(m => m.id === action.milestoneId);
                if (milestone) {
                    const date = milestone.targetDate.toISOString().slice(0, 10), tomorrow = today(new Date(now.getTime() + 86400000));
                    if (date === tomorrow) {
                        await notify(row.userId, `evidence-deadline:${action.id}:${date}`, 'task', '目前行動明天截止，查看下一步', 'Your current action is due tomorrow', { actionId: action.id, planId: plan.id, dueDate: date });
                        queued++;
                    }
                }
            }
        }
    }
    const sessions = await prisma.roundtableRegistration.findMany({ where: { status: 'confirmed', roundtable: { status: 'scheduled', startsAt: { gt: now, lte: new Date(now.getTime() + 86400000) }, host: { mentorCertification: { status: 'approved' } } } }, include: { roundtable: true }, take: 100 });
    for (const reg of sessions) {
        await notify(reg.userId, `evidence-roundtable:${reg.id}:${reg.roundtable.startsAt.toISOString()}`, 'roundtable', '圓桌將在 24 小時內開始，請確認會前準備', 'Your roundtable starts within 24 hours; review preparation', { roundtableId: reg.roundtableId, registrationId: reg.id });
        queued++;
    }
    return { prepared, queued };
}
