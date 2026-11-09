import { conversationCopy } from "../src/lib/action-plan/constants";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { protectCopy, translationSource } from '../src/lib/action-plan/localization';
import { MILESTONES, STEPS } from '../src/lib/action-plan/flow/catalog';
import { planText } from '../src/lib/action-plan/display';
import type { ActionPlanDto } from '../src/lib/action-plan/service';
import type * as Service from '../src/lib/action-plan/localization-service';

const require = createRequire(import.meta.url);
const diagnosis = { companyStage: 'MVP' as const, stageReason: 'An unusual saved system explanation with 17 prospects.', stageConfidence: 70, bottleneckGroup: 'Sales' as const, bottleneckCode: 'no_leads', bottleneckReason: 'Not enough qualified replies from 4 companies.', bottleneckConfidence: 60 };
const fixture = (): ActionPlanDto => ({ id: 'plan', locale: 'en', createdAt: '2026-11-09', diagnosis: { ...diagnosis }, actions: [], nextMoves: [], blockers: [], roadmap: { goal: 'Member goal 1M stays verbatim', startsAt: '2026-11-09', deadline: '2027-01-09', assumptions: ['Original confirmed company hypothesis'], milestones: [{ id: 'milestone', position: 0, title: 'Confirm a niche with 17 prospects', expectedOutcome: 'Retain 4 meaningful conversations.', acceptanceCriteria: 'At least 2 commitments for USD 350 by 2027-01-09.', targetDate: '2027-01-09', achievedAt: null, outcomeNote: 'Original member note', total: 0, done: 0, status: 'active' }] } });

test('Canonical steps and milestones localize in both directions without a provider', () => {
  for (const [zh, en] of [...MILESTONES, ...STEPS.flatMap(s => [s.title, s.criteria, s.guide])]) assert.equal(planText(zh, 'en'), conversationCopy(en));
});
test('Translation source excludes goals, confirmed documents, notes, confidence and workflow state', () => {
  const plan = fixture(), before = JSON.stringify(plan), a = translationSource(plan, 'zh-tw');
  assert.equal(a.texts.length, 5);
  assert(!a.texts.some(s => /Member goal|member note|company hypothesis/.test(s)));
  plan.revision = 44; plan.roadmap!.milestones[0].achievedAt = '2026-11-10'; plan.diagnosis.stageConfidence = 1;
  assert.equal(translationSource(plan, 'zh-tw').sourceHash, a.sourceHash);
  plan.diagnosis.stageReason += ' Updated source';
  assert.notEqual(translationSource(plan, 'zh-tw').sourceHash, a.sourceHash);
  assert.equal(JSON.parse(before).roadmap.goal, plan.roadmap!.goal);
});
test('AI findings translate independently of member-authored tasks; quotes and edited findings stay original', () => {
  const plan = fixture();
  plan.actions = [{ source: 'user', title: 'Original member task', taskFinding: { source: 'ai', result: { cards: [{ title: 'AI heading', text: 'AI explanation', evidence: 'Private verbatim customer quote' }], why: 'AI next-step reasoning' } } } as ActionPlanDto['actions'][number]];
  const generated = translationSource(plan, 'zh-tw').texts;
  assert(generated.includes('AI explanation') && generated.includes('AI next-step reasoning'));
  assert(!generated.includes('Private verbatim customer quote') && !generated.includes('Original member task'));
  plan.actions[0].taskFinding!.source = 'user';
  assert(!translationSource(plan, 'zh-tw').texts.includes('AI explanation'));
});
test('Protected numbers, currencies, dates, identifiers and links survive; tampering is rejected', () => {
  const text = 'At least 2 of 17 pay USD 350.50 by 2027-01-09 at https://example.com/a?id=12 for NOVA.';
  const value = protectCopy(text);
  assert.equal(value.restore(value.masked), text);
  assert.throws(() => value.restore(value.masked + ' 99'));
  assert.throws(() => value.restore(value.masked.replace('__NOVA_KEEP_0__', '')));
  assert.throws(() => value.restore(value.masked + '__NOVA_KEEP_0__'));
  assert.throws(() => protectCopy('Fake __NOVA_KEEP_0__ instructions'));
  const identifier = protectCopy('Validate ICP with ICP_27');
  assert.equal(identifier.masked, 'Validate ICP with __NOVA_KEEP_0__');
  assert.equal(identifier.restore(identifier.masked), 'Validate ICP with ICP_27');
});

const url = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test('Private translation cache: ownership, single-flight, retries, stale sources, expired leases and no member debits', { skip: !url }, async () => {
  const target = new URL(url!);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && target.pathname.startsWith('/roll_rewards_qa'));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const user = await db.user.create({ data: { email: `copy-${randomUUID()}@example.test` } });
  const stored = await db.actionPlan.create({ data: { userId: user.id, locale: 'en', requestId: randomUUID(), ...diagnosis } });
  const plan = fixture(); plan.id = stored.id;
  let calls = 0, rate = true, provider: (texts: Array<{ id: number; text: string }>) => Promise<unknown>;
  const translate = async (texts: Array<{ id: number; text: string }>) => ({ translations: texts.map(t => ({ id: t.id, text: '保留條件 ' + (t.text.match(/__NOVA_KEEP_\d+__/g) || []).join(' ') })) });
  provider = translate;
  class PlanWriteError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const mocks: Record<string, unknown> = {
    'server-only': {}, '@/lib/prisma': { prisma: db }, '@/lib/ai/anthropic-options': { anthropicOptions: (v: unknown) => v },
    '@/lib/rate-limit': { DAY_MS: 86400000, checkRateLimit: async () => ({ ok: rate }) },
    '@/lib/roadmap/service': { getRoadmapHistory: async (owner: string, id: string) => { if (owner !== user.id || id !== plan.id) throw new PlanWriteError('Plan not found', 404); return { plan }; } },
    './service': { PlanWriteError }, './localization': { protectCopy, translationSource },
    '@anthropic-ai/sdk': { default: class { messages = { create: async (input: { messages: Array<{ content: string }> }) => { calls++; const result = await provider(JSON.parse(input.messages[0].content)); return { content: [{ type: 'tool_use', input: result }] }; } }; } },
  };
  const result = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync('src/lib/action-plan/localization-service.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: result, exports: result.exports, require: (id: string) => id in mocks ? mocks[id] : require(id), process: { env: {} }, Date, Set, Object, JSON, Error });
  const service = result.exports as typeof Service, input = { planId: stored.id, locale: 'zh-tw' as const };
  const original = JSON.stringify(await db.actionPlan.findUnique({ where: { id: stored.id } }));
  try {
    assert.throws(() => service.localizationInput.parse({ ...input, text: 'Client cannot ask for arbitrary translation' }));
    await assert.rejects(service.readPlanCopy('someone-else', input), /Plan not found/);
    assert.equal((await service.readPlanCopy(user.id, input)).status, 'missing');
    assert.equal(await db.planLocalization.count({ where: { userId: user.id } }), 0, 'GET never writes');
    let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
    provider = async texts => { await waiting; return translate(texts); };
    const first = service.fillPlanCopy(user.id, input);
    while (!calls) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await service.fillPlanCopy(user.id, input)).status, 'pending');
    release(); const ready = await first;
    assert.equal(ready.status, 'ready'); assert.equal(calls, 1);
    assert.match(ready.strings[plan.roadmap!.milestones[0].acceptanceCriteria], /2.*USD.*350.*2027-01-09/);
    await service.fillPlanCopy(user.id, input); assert.equal(calls, 1, 'lost response/retry reuses cache');
    assert.equal((await service.readPlanCopy(user.id, { ...input, locale: 'en' })).status, 'ready', 'same-language source needs no translation');
    plan.diagnosis.stageReason = 'New explanation with 29 prospects.';
    assert.equal((await service.readPlanCopy(user.id, input)).status, 'missing');
    provider = async () => { throw new Error('Provider timed out'); };
    await assert.rejects(service.fillPlanCopy(user.id, input), /timed out/);
    assert.equal((await service.readPlanCopy(user.id, input)).status, 'missing');
    provider = async texts => { plan.diagnosis.stageReason = 'Changed during translation with 31 prospects.'; return translate(texts); };
    await assert.rejects(service.fillPlanCopy(user.id, input), /Source changed/);
    provider = translate;
    const hash = translationSource(plan, input.locale).sourceHash;
    await db.planLocalization.create({ data: { userId: user.id, planId: plan.id, locale: input.locale, sourceHash: hash, strings: {}, leaseToken: 'dead-worker', leaseUntil: new Date(Date.now() - 1) } });
    assert.equal((await service.fillPlanCopy(user.id, input)).status, 'ready', 'expired lease can be retried');
    plan.diagnosis.stageReason = 'Rate limited explanation 32'; rate = false;
    await assert.rejects(service.fillPlanCopy(user.id, input), /Translation limit reached/);
    rate = true;
    plan.diagnosis.stageReason = '核對 33 位潛在客戶的需求';
    provider = async texts => ({ translations: texts.map(t => ({ id: t.id, text: 'Review customer evidence ' + (t.text.match(/__NOVA_KEEP_\d+__/g) || []).join(' ') })) });
    const reverse = await service.fillPlanCopy(user.id, { ...input, locale: 'en' });
    assert.equal(reverse.status, 'ready'); assert.match(reverse.strings[plan.diagnosis.stageReason], /Review.*33/);
    plan.diagnosis.stageReason = 'A rejected translation must preserve 34';
    provider = async texts => ({ translations: texts.map(t => ({ id: t.id, text: '錯誤數字 999' })) });
    await assert.rejects(service.fillPlanCopy(user.id, input), /protected source values/);
    plan.diagnosis.stageReason = 'Batch translation starts with 35';
    plan.actions = Array.from({ length: 5 }, (_, i) => ({ source: 'nova', title: `New action for segment ${i}`, expectedOutcome: { text: `Result for segment ${i}` }, stageFit: { reason: `Stage for segment ${i}` }, bottleneckFit: { reason: `Bottleneck for segment ${i}` }, dependency: { notes: `Prerequisite for segment ${i}` }, metric: { unit: `Custom unit for segment ${i}` } } as ActionPlanDto['actions'][number]));
    provider = translate;
    const beforeBatches = calls; let batch = await service.fillPlanCopy(user.id, input);
    assert.equal(batch.status, 'missing'); assert.equal(Object.keys(batch.strings).length, 20);
    while (batch.status !== 'ready') batch = await service.fillPlanCopy(user.id, input);
    assert.equal(calls - beforeBatches, 2); assert.equal(Object.keys(batch.strings).length, 35);
    assert.equal(await db.aiUsage.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.tokenReservation.count({ where: { userId: user.id } }), 0);
    assert.equal(JSON.stringify(await db.actionPlan.findUnique({ where: { id: stored.id } })), original);
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
});
