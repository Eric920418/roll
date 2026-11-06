import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { anonymousCohortAverage, evaluateEvidence, evidenceStateSchema, evidencePolicySchema, hypothesisSchema, evidenceMutationSchema } from '../src/lib/evidence/schema';
import { weightedMatch } from '../src/lib/matchmaking/rank';
import { emptyInsight } from '../src/lib/customer-insights/schema';
import { emptyRecord } from '../src/lib/action-plan/flow/catalog';
import { roundtableMutationSchema, sessionDraftSchema, mentorDraftSchema, similarEvidenceStages } from '../src/lib/roundtables/schema';
import { pdfRuntime } from './helpers/pdf-runtime';
const hypothesis = (id = 'h1') => hypothesisSchema.parse({ id, description: 'Customer teams with manual reporting', why: 'A hypothesis to test, not a result', test: 'Talk with customers', who: 'Operations teams', size: 'Small team', buyer: 'Founder', pain: 'Slow reporting', alternatives: 'Spreadsheets' });
const sources = Array.from({ length: 5 }, (_, i) => ({ id: 'r' + i, company: 'Company ' + i, name: 'Person ' + i, pain: i < 3 ? 'Slow reporting' : 'Other pain ' + i, quote: i < 3 ? 'Reporting is slow' : 'Other pain ' + i, date: '2026-10-30', href: '/dashboard/agenda' }));
function state() { return evidenceStateSchema.parse({ hypotheses: [hypothesis()], selectedId: 'h1', links: sources.map(s => ({ id: s.id, hypothesisId: 'h1', fit: 'yes', relationship: 'prospect' })) }); }
test('Evidence stages use distinct sources, weighted pain, actual commitments and monotone history', () => { const value = state(); assert.equal(evaluateEvidence(value, sources, 0).stage, 4); assert.equal(evaluateEvidence(value, sources, 1).stage, 5); assert.equal(evaluateEvidence(value, sources.slice(0, 2), 0).stage, 2); assert.equal(evaluateEvidence({ ...value, maxStage: 5 }, sources.slice(0, 1), 0).stage, 5); assert.equal(evaluateEvidence(value, sources.map(s => ({ ...s, date: '2099-01-01' })), 10).stage, 2); const uncertain = { ...value, links: value.links.map(l => ({ ...l, fit: 'uncertain' as const })) }; assert.equal(evaluateEvidence(uncertain, sources, 1).stage, 2); const rejected = { ...value, links: value.links.map(l => ({ ...l, fit: 'no' as const })) }; assert.equal(evaluateEvidence(rejected, sources, 0).status, 'rejected'); assert.equal(evaluateEvidence(value, [...sources, sources[0]], 0).conversations, 5); assert(!evidencePolicySchema.safeParse({ highStrength: .2, mediumStrength: .5 }).success); assert(!evidenceMutationSchema.safeParse({ action: 'save', revision: 0, requestId: randomUUID(), maxStage: 5 }).success); });
test('Anonymous cohorts require five valid consenting samples', () => { assert.equal(anonymousCohortAverage([1, 2, 3, 4]), null); assert.deepEqual(anonymousCohortAverage([1, 2, 3, 4, 5]), { average: 3, minimumSample: 5 }); assert.equal(anonymousCohortAverage([1, 2, 3, 4, NaN]), null); });
test('Auto grouping keeps the full peer group within one evidence stage',()=>{assert(similarEvidenceStages([1,2,2]));assert(!similarEvidenceStages([1,2,3]));assert(similarEvidenceStages([]));});
test('Five-factor recommendations only cite public facts and never pretend to be buying intent', () => { const viewer = { looksFor: 'customer discovery', offers: 'software development', icp: 'SaaS founders', companyStage: 'Validation' }, card = { id: 'c', role: 'founder' as const, categories: ['collaboration' as const], activity: 'week' as const, verified: false, recommended: false, reasons: ['industry' as const], offers: 'customer discovery', looksFor: 'software development', icp: 'SaaS founders', stage: 'Validation' }; const match = weightedMatch(viewer, card, .5); assert.equal(match.score, 95); assert.equal(match.reasons.length, 3); assert(!JSON.stringify(match.reasons).includes('%')); const hidden = weightedMatch(viewer, { ...card, offers: undefined, looksFor: undefined, icp: undefined, stage: undefined, reasons: [] }); assert.equal(hidden.relevant, false); assert(!JSON.stringify(hidden).includes('SaaS founders')); });
test('PDF completion in isolated PostgreSQL: ownership, hypotheses, semantic AI, drafts, consent and durable email', { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async (t) => {
    const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname.startsWith('/roll_rewards_qa'));
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 8 }) }), ids: string[] = [], emails: string[] = [];
    let now = Date.parse('2026-11-02T01:00:00Z'), aiCalls = 0, aiMode = 'valid', pause: Promise<void> | null = null, entered: () => void = () => { };
    class Clock extends Date {
        constructor(v?: string | number | Date) { super(v === undefined ? now : v instanceof Date ? v.getTime() : v); }
        static now() { return now; }
    }
    const reserved: string[] = [], completed: Array<{
        id: string;
        ok: boolean;
    }> = [], sent: Array<{
        key: string;
        payload: unknown;
    }> = [];
    let failMail = false;
    const env = { AUTH_SECRET: 'q'.repeat(64), NEXT_PUBLIC_APP_URL: 'https://nova.test', MEMBER_NETWORK_EMAIL_ENABLED: 'true', MEMBER_NETWORK_ENABLED: 'true', RESEND_API_KEY: 'qa-disabled', RESEND_FROM_EMAIL: 'NOVA <qa@example.invalid>' };
    const mocks: Record<string, unknown> = { 'server-only': {}, '@/lib/prisma': { prisma: db }, '@/lib/auth/guard': { requireAdmin: async () => ({ email: 'admin@example.invalid' }) }, '@/lib/auth/account': { getCurrentAccount: async () => null, getBetaAccess: async () => false }, '@/lib/billing/gate': { getEffectivePlan: () => 'business' }, '@/lib/getting-started/service': { completeGettingStarted: async () => { } }, '@/lib/rate-limit': { DAY_MS: 86400000, checkRateLimit: async () => ({ ok: true }) }, '@/lib/security/log': { logSecurityError: () => 'trace-qa', publicErrorMessage: () => 'trace-qa' }, '@/lib/cms/content': { getInsightTeasers: async () => [] }, '@/lib/playbook/quiz': { fortnightIndex: () => 0, periodEnd: () => new Date(now + 86400000) }, '@/lib/ai/allowance': { reserveAiUsage: async () => { const id = randomUUID(); reserved.push(id); return id; }, completeAiUsage: async (id: string, ok: boolean) => { completed.push({ id, ok }); } }, '@anthropic-ai/sdk': class {
            messages = { create: async (input: {
                    tools: Array<{
                        name: string;
                    }>;
                    messages: Array<{
                        content: string;
                    }>;
                }) => {
                    aiCalls++;
                    if (aiMode === 'credit')
                        throw { status: 400, error: { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } } };
                    entered();
                    if (pause)
                        await pause;
                    const tool = input.tools[0].name, data = JSON.parse(input.messages[0].content);
                    if (tool === 'group_pain')
                        return { content: [{ type: 'tool_use', name: tool, input: { topics: [{ title: 'Manual reporting pain', sources: data.map((s: {
                                                    id: string;
                                                    quote: string;
                                                }) => ({ id: s.id, quote: aiMode === 'forged' ? 'invented quote' : s.quote })) }] } }] };
                    return { content: [{ type: 'tool_use', name: tool, input: { draft: { kind: 'organize', values: { positioning: 'Reviewed positioning' }, confirmed: ['positioning'], criteria: [], tiers: [], selections: [] }, variants: aiMode === 'fewVariants' ? ['Only one'] : ['Option one', 'Option two', 'Option three'], sources: [{ id: data.source[0].id, quote: aiMode === 'forged' ? 'invented quote' : 'Manual reporting' }] } }] };
                } };
        } };
    const load = pdfRuntime(mocks, { Date: Clock, process: { env }, fetch: async (input: string, init: RequestInit) => {
            assert.equal(input, 'https://api.resend.com/emails');
            sent.push({ key: (init.headers as Record<string, string>)['Idempotency-Key'], payload: JSON.parse(String(init.body)) });
            if (failMail)
                return Response.json({ error: 'provider unavailable' }, { status: 503 });
            return Response.json({ id: 'qa-' + sent.length });
        }, setTimeout: (fn: () => void) => setTimeout(fn, 0) });
    const service = load<typeof import('../src/lib/evidence/service')>('src/lib/evidence/service.ts'), analysis = load<typeof import('../src/lib/evidence/analysis')>('src/lib/evidence/analysis.ts'), newsletter = load<typeof import('../src/lib/newsletter/service')>('src/lib/newsletter/service.ts'), reminders = load<typeof import('../src/lib/evidence/reminders')>('src/lib/evidence/reminders.ts'), assist = load<typeof import('../src/lib/action-plan/flow/assist')>('src/lib/action-plan/flow/assist.ts');
    const owner = await db.user.create({ data: { email: 'pdf-' + randomUUID() + '@example.invalid', plan: 'business' } }), other = await db.user.create({ data: { email: 'pdf-' + randomUUID() + '@example.invalid', plan: 'business' } });
    ids.push(owner.id, other.id);
    const before = JSON.stringify(await db.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }));
    const account = { id: owner.id, plan: 'business' } as Parameters<typeof analysis.analyseEvidence>[0];
    let view = await service.evidenceSnapshot(owner.id);
    const save = async (input: object) => { view = await service.mutateEvidence(owner.id, evidenceMutationSchema.parse({ revision: view.revision, requestId: randomUUID(), ...input })); return view; };
    try {
        await t.test('Administrator thresholds use a real transaction lock, reject stale versions and preserve prior settings', async () => {
            const previous = await db.setting.findUnique({ where: { key: 'novaEvidencePolicy' } }), route = load<typeof import('../src/app/api/admin/evidence/route')>('src/app/api/admin/evidence/route.ts');
            try {
                const current = await (await route.GET()).json(), body = { version: current.data.version, policy: { ...current.data.policy, conversations: 4, painConversations: 6 } }, request = () => new Request('https://nova.test/api/admin/evidence', { method: 'PUT', headers: { origin: 'https://nova.test', 'content-type': 'application/json' }, body: JSON.stringify(body) });
                const saved = await route.PUT(request());
                assert.equal(saved.status, 200);
                assert.equal((await saved.json()).data.policy.conversations, 4);
                assert.equal((await route.PUT(request())).status, 409);
            }
            finally {
                if (previous)
                    await db.setting.update({ where: { key: previous.key }, data: { value: previous.value as Prisma.InputJsonValue } });
                else
                    await db.setting.deleteMany({ where: { key: 'novaEvidencePolicy' } });
            }
        });
        await t.test('Source ownership, request replay and hypothesis history are enforced without editing member rows', async () => {
            const first = { action: 'save', hypothesis: hypothesis(), requestId: randomUUID(), revision: view.revision };
            view = await service.mutateEvidence(owner.id, evidenceMutationSchema.parse(first));
            const replay = await service.mutateEvidence(owner.id, evidenceMutationSchema.parse(first));
            assert.equal(replay.revision, view.revision);
            await assert.rejects(service.mutateEvidence(owner.id, evidenceMutationSchema.parse({ ...first, hypothesis: hypothesis('other') })));
            await save({ action: 'select', selectedId: 'h1' });
            for (let i = 0; i < 5; i++)
                await db.meetingNote.create({ data: { userId: owner.id, title: 'QA conversation', insight: { ...emptyInsight('discover'), company: 'Company ' + i, name: 'Person ' + i, fit: 'yes', date: '2026-11-02', notes: 'Manual reporting' } } });
            const foreign = await db.meetingNote.create({ data: { userId: other.id, title: 'Other member', insight: { ...emptyInsight('discover'), company: 'Private other', name: 'Other', notes: 'Other secret' } } });
            view = await service.evidenceSnapshot(owner.id);
            assert(!view.sources.some(s => s.id === foreign.id));
            await assert.rejects(save({ action: 'save', links: [{ id: foreign.id, hypothesisId: 'h1', fit: 'yes', relationship: 'prospect' }] }));
            await save({ action: 'save', links: view.sources.map(s => ({ id: s.id, hypothesisId: 'h1', fit: 'yes', relationship: 'prospect' })) });
            assert.equal(view.result.stage, 4);
            assert.equal(view.result.findings[0].count, 5);
            await save({ action: 'save', hypothesis: hypothesis('h2') });
            await save({ action: 'select', selectedId: 'h2' });
            assert.equal(view.result.stage, 2);
            assert.equal(view.state.selections.length, 2);
            assert.equal(await db.meetingNote.count({ where: { userId: owner.id } }), 5);
            await save({ action: 'select', selectedId: 'h1' });
            await save({ action: 'save', links: view.sources.map(s => ({ id: s.id, hypothesisId: 'h1', fit: 'yes', relationship: 'prospect' })) });
            assert.equal(JSON.stringify(await db.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })), before);
        });
        await t.test('Taipei conversations after midnight count today; tomorrow stays excluded', async () => { const old = now; now = Date.parse('2026-11-06T17:30:00Z'); const created: Array<{
            id: string;
        }> = []; try {
            for (const date of ['2026-11-07', '2026-11-08'])
                created.push(await db.meetingNote.create({ data: { userId: owner.id, title: 'QA midnight boundary', insight: { ...emptyInsight('discover'), company: 'Midnight ' + date, name: 'Buyer', date, notes: 'Actual saved conversation' } } }));
            const sources = await service.evidenceSources(owner.id);
            assert(sources.sources.some(s => s.id === created[0].id));
            assert(!sources.sources.some(s => s.id === created[1].id));
        }
        finally {
            await db.meetingNote.deleteMany({ where: { id: { in: created.map(r => r.id) } } });
            now = old;
        } });
        await t.test('Grounded pain grouping is idempotent, refunds failed AI and rejects stale source results', async () => {
            view = await service.evidenceSnapshot(owner.id);
            const input = { revision: view.revision, requestId: randomUUID(), locale: 'en' as const }, beforeCalls = aiCalls;
            view = await analysis.analyseEvidence(account, input);
            assert.equal(aiCalls, beforeCalls + 1);
            assert.equal(view.result.findings[0].title, 'Manual reporting pain');
            await analysis.analyseEvidence(account, input);
            assert.equal(aiCalls, beforeCalls + 1);
            const snapshot=service.evidenceSnapshot;service.evidenceSnapshot=async()=>{throw new Error('QA response assembly outage');};try{await assert.rejects(analysis.analyseEvidence(account,input),(e:unknown)=>(e as {status:number}).status===409);}finally{service.evidenceSnapshot=snapshot;}await analysis.analyseEvidence(account,input);assert.equal(aiCalls,beforeCalls+1);
            aiMode = 'forged';
            view = await service.evidenceSnapshot(owner.id);
            await assert.rejects(analysis.analyseEvidence(account, { revision: view.revision, requestId: randomUUID(), locale: 'en' }));
            assert.equal(completed.at(-1)?.ok, false);
            assert.equal((await db.meetingNote.count({ where: { userId: owner.id } })), 5);
            aiMode = 'valid';
            aiMode = 'credit';
            view = await service.evidenceSnapshot(owner.id);
            await assert.rejects(analysis.analyseEvidence(account, { revision: view.revision, requestId: randomUUID(), locale: 'en' }), (e: unknown) => (e as {
                status: number;
            }).status === 400);
            assert.equal(completed.at(-1)?.ok, false);
            aiMode = 'valid';
        });
        await t.test('Email preferences default off, signed unsubscribe is scoped and stale signatures cannot override a new consent version', async () => {
            view = await service.evidenceSnapshot(owner.id);
            assert.equal(view.state.preferences.weekly, false);
            await save({ action: 'preferences', preferences: { ...view.state.preferences, weekly: true } });
            const token = reminders.evidenceToken(owner.id, view.state.preferenceVersion, 'weekly');
            await assert.rejects(reminders.unsubscribeEvidence(token + 'x'));
            await reminders.unsubscribeEvidence(token);
            view = await service.evidenceSnapshot(owner.id);
            assert.equal(view.state.preferences.weekly, false);
            await save({ action: 'preferences', preferences: { ...view.state.preferences, weekly: true } });
            await assert.rejects(reminders.unsubscribeEvidence(token));
            assert.equal((await service.evidenceSnapshot(owner.id)).state.preferences.weekly, true);
            assert.throws(() => reminders.readEvidenceToken(newsletter.newsletterToken(owner.id, 1, 'unsubscribe')));
        });
        await t.test('Newsletter confirms ownership, never touches accounts, retries once per receipt and cancels after unsubscribe', async () => {
            const email = 'newsletter-' + randomUUID() + '@example.invalid';
            emails.push(email);
            const input = { email, locale: 'en' as const, timeZone: 'America/New_York', consent: true as const, company: '' };
            await newsletter.signupNewsletter(input, new Date(now));
            await newsletter.signupNewsletter(input, new Date(now));
            const row = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
            assert.equal(row.status, 'pending');
            assert.equal(await db.newsletterDelivery.count({ where: { subscriberId: row.id } }), 1);
            failMail = true;
            const first = await newsletter.runNewsletter(new Date(now + 1000));
            assert.equal(first.failed, 1);
            assert.equal(await db.newsletterSubscriber.count({ where: { email, status: 'active' } }), 0);
            failMail = false;
            await newsletter.runNewsletter(new Date(now + 16 * 60000));
            assert.equal(sent.length, 2);
            assert.equal(sent[0].key, sent[1].key);
            assert.deepEqual(sent[0].payload, sent[1].payload);
            const token = newsletter.newsletterToken(row.id, row.version, 'confirm');
            await assert.rejects(newsletter.newsletterAction(token, 'unsubscribe', new Date(now)));
            await newsletter.newsletterAction(token, 'confirm', new Date(now));
            const active = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: row.id } });
            assert.equal(active.status, 'active');
            assert(active.nextDigestAt);
            const monday = active.nextDigestAt!;
            assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).format(monday), 'Mon, 09');
            const count = sent.length;
            await newsletter.runNewsletter(new Date(monday.getTime() + 60000));
            assert.equal(sent.length, count + 1);
            await newsletter.runNewsletter(new Date(monday.getTime() + 120000));
            assert.equal(sent.length, count + 1);
            await newsletter.newsletterAction(newsletter.newsletterToken(row.id, row.version, 'unsubscribe'), 'unsubscribe', monday);
            await newsletter.runNewsletter(new Date(monday.getTime() + 8 * 86400000));
            assert.equal(sent.length, count + 1);
            const memberEmail = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
            assert.equal(memberEmail.plan, 'business');
        });
        await t.test('Roundtable series, real auto-matching, preparation privacy, absence release and feedback', async () => {
            const roundtables = load<typeof import('../src/lib/roundtables/service')>('src/lib/roundtables/service.ts');
            const host = await db.user.create({ data: { email: 'pdf-host-' + randomUUID() + '@example.invalid', plan: 'business' } });
            ids.push(host.id);
            await db.matchmakingProfile.create({ data: { userId: owner.id, role: 'founder', country: 'TW', industry: 'saas', slogan: '', offers: '', looksFor: '' } });
            const mentor = mentorDraftSchema.parse({ publicName: 'QA certified host', bio: 'Actual QA fixture, never a public event', expertise: 'Customer validation and evidence', references: ['https://example.invalid/reference'], languages: ['en'], industries: ['all'] });
            await db.mentorCertification.create({ data: { userId: host.id, status: 'approved', draft: mentor } });
            const run = (userId: string, input: unknown) => roundtables.mutateRoundtable(userId, roundtableMutationSchema.parse(input));
            const draft = sessionDraftSchema.parse({ topic: 'QA evidence series', description: 'Review actual customer evidence and prepare next steps', steps: ['01-1'], industry: 'all', languages: ['en'], startsAt: '2026-11-03T01:00:00Z', endsAt: '2026-11-03T02:00:00Z', timezone: 'Asia/Taipei', capacity: 4, registrationMode: 'instant', meetingUrl: 'https://meet.google.com/qa-fixture', repeatCount: 3, frameworkStages: [4, 5] });
            const create = { action: 'create', requestId: randomUUID(), draft }, id = await run(host.id, create);
            assert.equal(await run(host.id, create), id);
            const sessions = await db.roundtable.findMany({ where: { hostId: host.id }, orderBy: { startsAt: 'asc' } });
            assert.equal(sessions.length, 3);
            assert.equal(sessions[1].startsAt.getTime() - sessions[0].startsAt.getTime(), 14 * 86400000);
            const match = { action: 'autoApply', requestId: randomUUID(), name: 'QA founder', question: 'How to verify customer demand?', consent: true, language: 'en', timezone: 'Asia/Taipei' };
            assert.equal(await run(owner.id, match), id);
            assert.equal(await run(owner.id, match), id);
            await assert.rejects(run(owner.id, { ...match, question: 'Changed request' }));
            for (const session of sessions.slice(1))
                await run(owner.id, { action: 'apply', id: session.id, name: 'QA founder', question: match.question, consent: true });
            const otherHost=await db.user.create({data:{email:'pdf-host-'+randomUUID()+'@example.invalid',plan:'business'}});ids.push(otherHost.id);await db.mentorCertification.create({data:{userId:otherHost.id,status:'approved',draft:mentor}});const otherSeries=await run(otherHost.id,{...create,draft:{...draft,startsAt:'2026-11-28T01:00:00Z',endsAt:'2026-11-28T02:00:00Z'}});assert.notEqual((await db.roundtable.findUniqueOrThrow({where:{id:otherSeries!}})).seriesId,sessions[0].seriesId);await run(owner.id,{action:'apply',id:otherSeries,name:'QA founder',question:match.question,consent:true});
            await db.roundtable.updateMany({where:{hostId:{in:[host.id,otherHost.id]}},data:{frameworkStages:[]}});
            await db.matchmakingProfile.create({data:{userId:other.id,role:'founder',country:'TW',industry:'saas',slogan:'',offers:'',looksFor:''}});const compatible=await run(other.id,{...match,requestId:randomUUID(),name:'Other QA founder'});assert(![...sessions.map(r=>r.id),otherSeries].includes(compatible),'Auto matching must skip groups whose confirmed peers are three stages apart');
            const row = () => db.roundtableRegistration.findUniqueOrThrow({ where: { roundtableId_userId: { roundtableId: id!, userId: owner.id } } });
            now = Date.parse('2026-11-02T02:00:00Z');
            await reminders.ensurePreparations(new Date(now));
            let reg = await row();
            assert.equal((reg.preparation as {
                share: boolean;
            }).share, false);
            assert.equal((await roundtables.getRoundtables(host.id, id!)).sessions.find(r => r.id === id)!.people[0].preparation, null);
            await assert.rejects(run(other.id, { action: 'prepare', id, revision: reg.revision, question: 'Unauthorized question', share: true }));
            await run(owner.id, { action: 'prepare', id, revision: reg.revision, question: 'Share only weekly counts', share: true });
            reg = await row();
            assert.equal((reg.preparation as {
                conversations: number;
            }).conversations, 5);
            assert((await roundtables.getRoundtables(host.id, id!)).sessions.find(r => r.id === id)!.people[0].preparation);
            assert.equal((await roundtables.getRoundtables(other.id, id!)).sessions.find(r => r.id === id)!.people.length, 0);
            await run(owner.id, { action: 'withdraw', id });
            await run(owner.id, { action: 'apply', id, name: 'QA founder', question: match.question, consent: true });
            assert.equal((await row()).preparation, null, 'Reapplying requires fresh sharing consent');
            for (const session of sessions.slice(0, 2)) {
                now = session.endsAt.getTime() + 60000;
                const current = await db.roundtable.findUniqueOrThrow({ where: { id: session.id } }), registration = await db.roundtableRegistration.findFirstOrThrow({ where: { roundtableId: session.id, userId: owner.id } });
                await run(host.id, { action: 'finish', id: session.id, revision: current.revision, entries: [{ registrationId: registration.id, attendance: 'absent' }] });
            }
            assert.equal((await db.roundtableRegistration.findFirstOrThrow({ where: { roundtableId: sessions[2].id, userId: owner.id } })).status, 'cancelled');
            assert.equal((await row()).attendance, 'absent');
            assert.equal((await db.roundtableRegistration.findFirstOrThrow({where:{roundtableId:otherSeries!,userId:owner.id}})).status,'confirmed','Absences must not release another host’s series');
            const feedbackSession = await run(host.id, { action: 'create', requestId: randomUUID(), draft: { ...draft, repeatCount: 1, startsAt: '2026-11-19T01:00:00Z', endsAt: '2026-11-19T02:00:00Z' } });
            await run(owner.id, { action: 'apply', id: feedbackSession, name: 'QA founder', question: match.question, consent: true });
            const feedbackReg = await db.roundtableRegistration.findFirstOrThrow({ where: { roundtableId: feedbackSession!, userId: owner.id } });
            now = Date.parse('2026-11-19T03:00:00Z');
            const current = await db.roundtable.findUniqueOrThrow({ where: { id: feedbackSession! } });
            await run(host.id, { action: 'finish', id: feedbackSession, revision: current.revision, entries: [{ registrationId: feedbackReg.id, attendance: 'attended', commitment: { title: 'Talk to three customers', criteria: 'Save three real conversations', dueDate: '2026-11-24' } }] });
            const feedback = { action: 'feedback', id: feedbackSession, requestId: randomUUID(), rating: 5, note: 'Useful evidence discussion' };
            await run(owner.id, feedback);
            await run(owner.id, feedback);
            await assert.rejects(run(owner.id, { ...feedback, rating: 4 }));
            await assert.rejects(run(other.id, feedback));
            assert(await db.weekCalendarItem.findUnique({ where: { id: (await db.roundtableRegistration.findUniqueOrThrow({ where: { id: feedbackReg.id } })).calendarItemId! } }));
            // Legacy receipt hashes must remain replayable after optional series fields were added.
            now = Date.parse('2026-11-02T01:00:00Z');
            const legacyDraft = { ...draft, repeatCount: 1, frameworkStages: [], startsAt: '2026-11-25T01:00:00Z', endsAt: '2026-11-25T02:00:00Z' }, legacyRequest = randomUUID(), legacyId = await run(host.id, { action: 'create', requestId: legacyRequest, draft: legacyDraft });
            const base = Object.fromEntries(Object.entries(legacyDraft).filter(([key]) => !["repeatCount", "frameworkStages"].includes(key)));
            await db.roundtable.update({ where: { id: legacyId! }, data: { requestHash: createHash('sha256').update(JSON.stringify(base)).digest('hex') } });
            assert.equal(await run(host.id, { action: 'create', requestId: legacyRequest, draft: legacyDraft }), legacyId);
        });
        await t.test('Durable weekly email catches up once and sender rechecks consent before retries', async () => {
            const notifications = load<typeof import('../src/lib/network/notifications')>('src/lib/network/notifications.ts');
            now = Date.parse('2026-11-02T01:00:00Z');
            view = await service.evidenceSnapshot(owner.id);
            await save({ action: 'preferences', preferences: { ...view.state.preferences, weekly: true, timeZone: 'Asia/Taipei', locale: 'en' } });
            const next = await db.evidenceWorkspace.findUniqueOrThrow({ where: { userId: owner.id } });
            const due = evidenceStateSchema.parse(next.data).nextWeeklyAt!;
            now = Date.parse(due) + 2 * 3600000;
            await reminders.runEvidenceReminders(new Date(now));
            await reminders.runEvidenceReminders(new Date(now));
            const rows = await db.memberNotification.findMany({ where: { userId: owner.id, kind: 'evidence', eventKey: { startsWith: 'evidence-week:' } }, include: { delivery: true } });
            assert.equal(rows.length, 1);
            assert(rows[0].delivery);
            // Prisma defaults use the actual server clock; set only this fixture receipt to the injected clock.
            await db.memberNotificationDelivery.update({ where: { id: rows[0].delivery!.id }, data: { createdAt: new Date(now), nextAttemptAt: new Date(now) } });
            const count = sent.length;
            failMail = true;
            await notifications.runNotifications(new Date(now));
            assert.equal(sent.length, count + 1);
            failMail = false;
            const token = reminders.evidenceToken(owner.id, evidenceStateSchema.parse((await db.evidenceWorkspace.findUniqueOrThrow({ where: { userId: owner.id } })).data).preferenceVersion, 'weekly');
            await reminders.unsubscribeEvidence(token);
            await notifications.runNotifications(new Date(now + 16 * 60000));
            assert.equal(sent.length, count + 1);
            assert.equal((await db.memberNotificationDelivery.findUniqueOrThrow({ where: { id: rows[0].delivery!.id } })).status, 'cancelled');
            for (const file of ['src/app/api/evidence/unsubscribe/route.ts', 'src/app/api/newsletter/confirm/route.ts', 'src/app/api/newsletter/unsubscribe/route.ts']) {
                const route = load<{
                    GET: () => Promise<Response>;
                    POST: (r: Request) => Promise<Response>;
                }>(file);
                assert.equal((await route.GET()).status, 405);
                assert.equal((await route.POST(new Request('https://nova.test/api/callback?token=forged', { method: 'POST' }))).status, 400);
            }
            now = Date.parse('2026-11-02T01:00:00Z');
        });
        await t.test('Task assistance preserves drafts, current-step permissions and AI idempotency; conflicting completion never applies generated data', async () => {
            const plan = await db.actionPlan.create({ data: { userId: owner.id, activeKey: owner.id, requestId: randomUUID(), locale: 'en', companyStage: 'Validation', stageReason: 'QA evidence', stageConfidence: 70, bottleneckGroup: 'Sales', bottleneckCode: 'no_icp', bottleneckReason: 'QA evidence', bottleneckConfidence: 70, goal: 'Verify customer demand', goalStartsAt: new Date('2026-10-01'), goalDeadline: new Date('2027-10-01') } });
            const persist = load<typeof import('../src/lib/action-plan/flow/persist')>('src/lib/action-plan/flow/persist.ts');
            await persist.insertFlow(db as unknown as Prisma.TransactionClient, plan.id, 'en', { companyStage: 'Validation', stageReason: 'QA', stageConfidence: 70, bottleneckGroup: 'Sales', bottleneckCode: 'no_icp', bottleneckReason: 'QA', bottleneckConfidence: 70 }, '2026-10-01', '2027-10-01');
            const actions = await db.actionItem.findMany({ where: { actionPlanId: plan.id }, orderBy: { executionOrder: 'asc' } }), record = { ...emptyRecord('r1'), fit: 'yes' as const, company: 'Company', name: 'Person', relationship: 'prospect', date: '2026-10-30', pain: 'Manual reporting', solution: 'Spreadsheets', severity: 'high' as const, wtp: 'willing' as const };
            await db.actionItem.update({ where: { id: actions[0].id }, data: { done: true, completedAt: new Date(now), taskWorkspace: { version: 2, step: '01-1', data: { kind: 'conversation', market: 'TW', records: [record] } } } });
            const input = { planId: plan.id, step: '01-2' as const, revision: 0, requestId: randomUUID(), locale: 'en' as const, transcript: '' }, count = reserved.length;
            const result = await assist.assistTask(account, input);
            assert.equal(reserved.length, count + 1);
            assert.deepEqual(Array.from(result.result.draft.kind === 'organize' ? result.result.draft.confirmed : []), []);
            assert.equal(await db.actionItem.count({ where: { id: actions[1].id, done: true } }), 0);
            await assist.assistTask(account, input);
            assert.equal(reserved.length, count + 1);
            const flowService=load<typeof import('../src/lib/action-plan/flow/service')>('src/lib/action-plan/flow/service.ts'),getFlow=flowService.getFlow;flowService.getFlow=async()=>{throw new Error('QA response assembly outage');};try{await assert.rejects(assist.assistTask(account,input),(e:unknown)=>(e as {status:number}).status===409);}finally{flowService.getFlow=getFlow;}await assist.assistTask(account,input);assert.equal(reserved.length,count+1);
            aiMode = 'fewVariants';
            const few = await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } });
            await assert.rejects(assist.assistTask(account, { ...input, revision: few.revision, requestId: randomUUID() }));
            assert.equal(completed.at(-1)?.ok, false);
            aiMode = 'valid';
            await assert.rejects(assist.assistTask({ ...account, id: other.id }, { ...input, requestId: randomUUID() }));
            await assert.rejects(assist.assistTask(account, { ...input, step: '02-3', requestId: randomUUID() }));
            let release: () => void = () => { };
            pause = new Promise<void>(r => release = r);
            let ready: () => void = () => { };
            const waiting = new Promise<void>(r => ready = r);
            entered = ready;
            const latest = await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } });
            const pending = assist.assistTask(account, { ...input, revision: latest.revision, requestId: randomUUID() });
            pending.catch(() => { });
            await waiting;
            await db.actionPlan.update({ where: { id: plan.id }, data: { revision: { increment: 1 } } });
            release();
            await assert.rejects(pending);
            pause = null;
            assert.equal(completed.at(-1)?.ok, false);
            assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: actions[1].id } })).taskWorkspace, null);
        });
    }
    finally {
        await db.roundtable.deleteMany({ where: { hostId: { in: ids } } });
        await db.newsletterSubscriber.deleteMany({ where: { email: { in: emails } } });
        await db.user.deleteMany({ where: { id: { in: ids } } });
        await db.$disconnect();
    }
});
