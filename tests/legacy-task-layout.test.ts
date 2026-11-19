import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import type { ActionPlanDto } from '../src/lib/action-plan/service';
import type { ActionPlanActionDto } from '../src/lib/action-plan/ranking';
import { emptyWorkspace } from '../src/lib/action-plan/workspace';

const action: ActionPlanActionDto = { id: 'a1', clientKey: 'task_1', displayNumber: 1, milestoneId: 'm1', milestonePosition: 0, title: 'Write a positioning statement', done: false, metric: { current: 0, target: 1, unit: 'statement' }, impact: { label: 'High', weight: 3 }, urgency: { type: 'scheduled', weight: 1 }, dependency: { level: 0, notes: null, actionIds: [], actionTitles: [], actionRefs: [], missingLink: false, resolved: true, blocked: false }, difficulty: { level: 2, actionTime: { minMinutes: 30, maxMinutes: 60, minHours: 0.5, maxHours: 1 } }, companyStage: 'MVP', stageFit: { score: 4, reason: 'Existing reason', confidence: 80, adjustedByUser: false }, bottleneck: { group: 'Sales', code: 'no_icp', label: 'Customer profile' }, bottleneckFit: { score: 4, reason: 'Existing method and reason', confidence: 80, adjustedByUser: false }, expectedOutcome: { category: 'customers', text: 'Original completion criterion', estimatedTime: { minDays: 1, maxDays: 7 } }, priorityScore: 10, rank: 1, source: 'user', completedAt: null };
const plan = { id: 'old-plan', workflowVersion: 1, locale: 'en', revision: 7, diagnosis: {}, createdAt: '2026-10-01', actions: [action, { ...action, id: 'a2', clientKey: 'task_2', displayNumber: 2, title: 'Completed original task', done: true, completedAt: '2026-10-02' }], nextMoves: [action], blockers: [], roadmap: { goal: 'Original goal', startsAt: '2026-10-01', deadline: '2027-04-01', assumptions: [], milestones: [{ id: 'm1', position: 0, title: 'Original milestone', status: 'active', expectedOutcome: 'Original result', acceptanceCriteria: 'Original acceptance criterion', targetDate: '2026-12-01', achievedAt: null, outcomeNote: null }] } } as unknown as ActionPlanDto;
function runtime(locale: string, children: Record<string, unknown> = {}) {
  return pdfRuntime({ react: { ...React, useState: (value: unknown) => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useRef: () => ({ current: null }) }, 'next-intl': { useLocale: () => locale, useTranslations: () => (key: string) => key }, 'next/navigation': { useRouter: () => ({ refresh() {} }) }, ...children });
}

test('Legacy priority layout retains original data and checkbox gates; other callers keep their view', () => {
  for (const locale of ['en', 'zh-tw']) {
    const load = runtime(locale);
    const Row = load<typeof import('../src/components/dashboard/ActionTaskRow')>('src/components/dashboard/ActionTaskRow.tsx').default;
    const props = { action, plan, compact: true, featured: true, focusMode: true, workspace: React.createElement('div', null, 'Original work'), onEdit: () => {}, onDelete: () => {}, onToggle: () => { throw Error('Rendering must not complete a task'); } };
    const original = JSON.stringify(plan), html = renderToStaticMarkup(React.createElement(Row, props));
    assert(html.includes('data-today-priority')); assert(html.includes('data-task-columns')); assert(!html.includes('Original completion criterion')); assert(!/>(?:Completion criteria|COMPLETION CRITERIA|完成標準)</.test(html)); assert(html.includes(locale === 'en' ? 'Saved progress' : '目前進度')); assert(html.includes('2026-12-01'));
    assert.match(html, /<input[^>]* disabled=""/); assert.equal(JSON.stringify(plan), original);
    assert.doesNotMatch(html, /Show more|Show less|Expected outcome|Estimated time|Why now|Stage fit|Blocked by \/ Prerequisites|顯示更多|收起|預估時間|為何現在做|階段適合度/);
    assert(!html.includes(action.bottleneckFit.reason)); assert(!html.includes(action.stageFit.reason));
    assert(html.includes('Original work')); assert(html.includes(locale === 'en' ? 'Edit' : '編輯')); assert(html.includes(locale === 'en' ? 'Delete' : '刪除'));
    assert(html.includes(locale === 'en' ? 'How to approach it' : '方法指引'));
    const ready = { ...action, taskWorkspace: { kind: 'positioning' as const, who: 'Founders', pain: 'Manual work', outcome: 'Less work', how: 'Evidence', tested: 3, reaction: 'Actual feedback' } };
    assert(!renderToStaticMarkup(React.createElement(Row, { ...props, action: ready })).match(/<input[^>]* disabled=""/));
    assert.match(renderToStaticMarkup(React.createElement(Row, { ...props, action: { ...ready, dependency: { ...ready.dependency, blocked: true } } })), /<input[^>]* disabled=""/);
    assert(!renderToStaticMarkup(React.createElement(Row, { action })).includes('data-today-priority'));
  }
});

test('Compact maps use real legacy milestone and action counts, including no roadmap', () => {
  const load = runtime('en'), Map = load<typeof import('../src/components/dashboard/ActionMap')>('src/components/dashboard/ActionMap.tsx').default;
  for (const milestones of [null, plan.roadmap]) {
    const html = renderToStaticMarkup(React.createElement(Map, { userId: 'owner', plan: { ...plan, roadmap: milestones }, event: null, compact: true } as React.ComponentProps<typeof Map>, 'Original steps'));
    assert(html.includes(`View all ${milestones?.milestones.length || 0} milestones`)); assert.equal((html.match(/<li/g) || []).length, milestones?.milestones.length || 0); assert(!html.includes('steps completed')); if (milestones) { assert(html.includes('aria-current="step"')); assert(html.includes('CURRENT POSITION')); } else assert(html.includes('Current plan'));
    assert(!html.includes('16 steps')); assert(!html.includes('View all 5 milestones'));
  }
});

test('Every legacy milestone omits criteria from featured, expanded, blocked and completed tasks without changing data', () => {
  for (const locale of ['en', 'zh-tw']) {
    const load = runtime(locale), Row = load<typeof import('../src/components/dashboard/ActionTaskRow')>('src/components/dashboard/ActionTaskRow.tsx').default;
    for (let position = 0; position < 5; position++) for (const state of ['ready', 'blocked', 'done']) {
      const task = { ...action, id: `a${position}`, milestoneId: `m${position}`, done: state === 'done', dependency: { ...action.dependency, blocked: state === 'blocked' } };
      const currentPlan = { ...plan, actions: [task], roadmap: { ...plan.roadmap!, milestones: [{ ...plan.roadmap!.milestones[0], id: task.milestoneId, position }] } };
      const before = JSON.stringify(currentPlan);
      for (const featured of [true, false]) {
        const html = renderToStaticMarkup(React.createElement(Row, { action: task, plan: currentPlan, compact: true, focusMode: true, featured, onToggle() {} }));
        assert(!html.includes(action.expectedOutcome.text)); assert.doesNotMatch(html, />(?:COMPLETION CRITERIA|Completion criteria|完成標準)</);
        if (featured) { assert(html.includes('2026-12-01')); assert(html.includes(locale === 'en' ? 'Saved progress' : '目前進度')); }
      }
      assert.equal(JSON.stringify(currentPlan), before);
    }
  }
});

test('Legacy plan rendering preserves steps and records for current, blocked, complete and awaiting states', () => {
  const empty = () => null;
  const load = runtime('en', { './TaskWorkspace': { __esModule: true, default: empty }, './ValidationWorkspace': { __esModule: true, default: empty }, './ConversationHistory': { __esModule: true, default: empty }, './ActionPlanManager': { ActionEditor: empty }, './InterviewWorkspace': { InterviewInsights: empty, CompletedTaskInsights: empty } });
  const Panel = load<typeof import('../src/components/dashboard/RoadmapPanel')>('src/components/dashboard/RoadmapPanel.tsx').default;
  const states = [plan, { ...plan, nextMoves: [], actions: [], roadmap: null }, { ...plan, nextMoves: [], actions: plan.actions.map(a => ({ ...a, done: false, dependency: { ...a.dependency, blocked: true } })) }, { ...plan, nextMoves: [], actions: plan.actions.map(a => ({ ...a, done: true })), roadmap: null }, { ...plan, nextMoves: [], actions: plan.actions.map(a => ({ ...a, done: true })), roadmap: { ...plan.roadmap!, milestones: plan.roadmap!.milestones.map(m => ({ ...m, status: 'awaiting' as const })) } }];
  for (const current of states) {
    const before = JSON.stringify(current), html = renderToStaticMarkup(React.createElement(Panel, { userId: 'owner', initialPlan: current, onChanged: () => { throw Error('Rendering must not rewrite a plan'); } }));
    assert(html.includes('data-today-priority')); assert(html.includes('data-next-step="goal"')); assert(html.includes('id="action-map"'));
    assert(!html.includes('Goal: ')); assert(!/\d+ \/ \d+ steps completed/.test(html));
    assert.equal(JSON.stringify(current), before);
  }
});

test('Separating legacy guidance keeps the original form and opens findings errors', () => {
  const load = runtime('en', { './LegacyOrganizeWork': { __esModule: true, default: ({ action }: { action: ActionPlanActionDto }) => React.createElement('div', null, action.taskWorkspace?.kind === 'positioning' && action.taskWorkspace.who, 'Shared organize work') } });
  const Workspace = load<typeof import('../src/components/dashboard/TaskWorkspace')>('src/components/dashboard/TaskWorkspace.tsx').default;
  const data = { ...emptyWorkspace('positioning'), who: 'Original customer' };
  const props = { userId: 'owner', action: { ...action, taskWorkspace: data }, plan, busy: false, onChanged() {}, onInsights() {}, onAnalyze() {} };
  const before = JSON.stringify(props.action);
  const html = renderToStaticMarkup(React.createElement(Workspace, { ...props, showGuide: false }));
  assert(html.includes('Original customer')); assert(html.includes('Shared organize work')); assert(!html.includes('Further learning'));
  assert.equal(JSON.stringify(props.action), before);
  const error = renderToStaticMarkup(React.createElement(Workspace, { ...props, showGuide: false, action: { ...props.action, title: 'Define and document your ideal customer profile', taskWorkspace: emptyWorkspace('icp'), taskFinding: { result: null, pending: false, error: 'HTTP 502 · provider_error · safe-trace' } } }));
  assert.match(error, /<details[^>]*open/); assert(error.includes('HTTP 502 · provider_error · safe-trace'));
});


test('Legacy reference save uses the latest server result to finish without a separate completion button', async () => {
  for (const ready of [false, true]) {
    const data = { kind: 'organize', values: {}, confirmed: [], selections: [], criteria: [], tiers: [] };
    const view = { step: '01-3', data, revision: plan.revision, leads: [], positioningReplies: [], result: { ready, current: ready ? 4 : 3, target: 4, reasons: [] } };
    let index = 0; const calls: { body?: { organizeData?: unknown; done?: boolean; revision?: number } }[] = [];
    const load = runtime('en', { react: { ...React, useState: (value: unknown) => [[view, data, plan.revision][index++] ?? value, () => {}], useEffect() {}, useRef: (value: unknown) => ({ current: value }), useCallback: (fn: unknown) => fn }, '@/lib/member-fetch': { MemberFetchError: class extends Error {}, memberFetch: async (_url: string, init?: { body: string }) => { const body = init?.body ? JSON.parse(init.body) : undefined; calls.push({ body }); return body ? { ...plan, revision: body.done ? 3 : 2 } : { organize: view }; } } });
    const Work = load<typeof import('../src/components/dashboard/LegacyOrganizeWork')>('src/components/dashboard/LegacyOrganizeWork.tsx').default;
    const tree = Work({ userId: 'owner', action, plan, busy: false, onChanged() {} });
    let save: ((data: unknown) => void) | undefined; let extra = 0;
    function walk(node: React.ReactNode) { React.Children.forEach(node, child => { if(!React.isValidElement<{ children?: React.ReactNode; step?: string; onSave?(data: unknown): void }>(child)) return; if(child.props.step === '01-3') save = child.props.onSave; if(child.type === 'button' && /Confirm and complete|Undo completion/.test(String(child.props.children))) extra++; walk(child.props.children); }); }
    walk(tree); assert(save); assert.equal(extra, 0); await save(data);
    const patches = calls.filter(c => c.body).map(c => c.body!);
    assert.equal(patches.length, ready ? 2 : 1); if(ready) { assert.equal(patches[1].done, true); assert.equal(patches[1].revision, 2); }
  }
});


test('Legacy positioning puts company search inside the workspace before confirmations', () => {
  for (const locale of ['en', 'zh-tw']) {
    const empty = () => null, mark = (value: string) => function Marker() { return React.createElement('div', null, value); };
    const load = runtime(locale, { './TaskWorkspace': { __esModule: true, default: ({ beforeResults }: { beforeResults?: React.ReactNode }) => React.createElement('div', null, 'POSITIONING_FORM', beforeResults, 'CONFIRMATIONS') }, './ValidationWorkspace': { __esModule: true, default: mark('EXTRA_FOLLOWUP') }, './prospecting/ProspectSearch': { __esModule: true, default: mark('COMPANY_SEARCH') }, './ConversationHistory': { __esModule: true, default: empty }, './ActionPlanManager': { ActionEditor: empty }, './InterviewWorkspace': { InterviewInsights: empty, CompletedTaskInsights: mark('EXTRA_FINDINGS') } });
    const Panel = load<typeof import('../src/components/dashboard/RoadmapPanel')>('src/components/dashboard/RoadmapPanel.tsx').default;
    for (const kind of ['positioning', 'scorecard', 'pilot'] as const) {
      const task = { ...action, taskWorkspace: emptyWorkspace(kind) }, previous = { ...action, id: 'previous', done: true, taskWorkspace: emptyWorkspace('positioning') };
      const current = { ...plan, nextMoves: [task], actions: [task, previous] }, before = JSON.stringify(current);
      const html = renderToStaticMarkup(React.createElement(Panel, { userId: 'owner', initialPlan: current, onChanged() { throw new Error('Rendering cannot rewrite a member plan'); } }));
      assert(html.includes('id="action-map"'));
      if (kind === 'pilot') assert(html.includes('COMPANY_SEARCH') && html.includes('EXTRA_FOLLOWUP'));
      else assert.doesNotMatch(html, /EXTRA_FOLLOWUP|EXTRA_FINDINGS|Edit goal|修改目標|Previous findings|前次重點/);
      assert.equal((html.match(/id="prospects"/g) || []).length, kind === 'scorecard' ? 0 : 1);
      if (kind === 'positioning') assert.match(html, /POSITIONING_FORM.*COMPANY_SEARCH.*CONFIRMATIONS/);
      assert.equal(JSON.stringify(current), before);
    }
  }
});

test('The standard legacy agenda shows four qualification actions and groups the original pilot under milestone two', () => {
  const placeholder = () => null;
  const load = runtime('zh-tw', {
    './TaskWorkspace': { __esModule: true, default: placeholder }, './ValidationWorkspace': { __esModule: true, default: placeholder },
    './prospecting/ProspectSearch': { __esModule: true, default: placeholder }, './ConversationHistory': { __esModule: true, default: placeholder },
    './ActionPlanManager': { ActionEditor: placeholder }, './InterviewWorkspace': { InterviewInsights: placeholder, CompletedTaskInsights: placeholder },
  });
  const Panel = load<typeof import('../src/components/dashboard/RoadmapPanel')>('src/components/dashboard/RoadmapPanel.tsx').default;
  const positioning = { ...action, clientKey: 'task_3', title: 'Write a positioning statement', displayNumber: 2 };
  const pilot = { ...action, id: 'pilot', clientKey: 'task_2', title: 'Run paid pilot offer', displayNumber: 5 };
  const items = [{ ...plan.actions[1], id: 'interview', clientKey: 'task_1' }, positioning,
    { ...action, id: 'score', clientKey: 'task_4' }, { ...action, id: 'tier', clientKey: 'task_5' }, pilot];
  const roadmap = plan.roadmap!;
  const current = { ...plan, legacyValidationSequence: true as const, actions: items, nextMoves: [positioning],
    roadmap: { ...roadmap, milestones: [...roadmap.milestones, { ...roadmap.milestones[0], id: 'commercial', position: 1, title: 'Paid pilot milestone' }] } };
  const original = JSON.stringify(current);
  const html = renderToStaticMarkup(React.createElement(Panel, { initialPlan: current, userId: 'owner', onChanged() { throw Error('Read-only rendering'); } }));
  assert.match(html, /行動.*2.*\s\/\s.*4.*整理類/);
  assert.match(html, /Paid pilot milestone.*Run paid pilot offer/);
  assert.equal(JSON.stringify(current), original);
});
