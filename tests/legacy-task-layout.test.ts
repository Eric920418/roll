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
    const props = { action, plan, compact: true, featured: true, focusMode: true, workspace: React.createElement('div', null, 'Original work'), onToggle: () => { throw Error('Rendering must not complete a task'); } };
    const original = JSON.stringify(plan), html = renderToStaticMarkup(React.createElement(Row, props));
    assert(html.includes('data-today-priority')); assert(html.includes('data-task-columns')); assert(html.includes('Original completion criterion')); assert(html.includes('2026-12-01'));
    assert.match(html, /<input[^>]* disabled=""/); assert.equal(JSON.stringify(plan), original);
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
    assert(html.includes('Expand steps')); assert.equal((html.match(/<li/g) || []).length, milestones?.milestones.length || 0); assert(!html.includes('steps completed')); assert(html.includes(milestones ? 'Milestone 1' : 'Current plan'));
    assert(!html.includes('16 steps')); assert(!html.includes('View all 5 milestones'));
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
  const load = runtime('en');
  const Workspace = load<typeof import('../src/components/dashboard/TaskWorkspace')>('src/components/dashboard/TaskWorkspace.tsx').default;
  const data = { ...emptyWorkspace('positioning'), who: 'Original customer' };
  const props = { userId: 'owner', action: { ...action, taskWorkspace: data }, plan, busy: false, onChanged() {}, onInsights() {}, onAnalyze() {} };
  const before = JSON.stringify(props.action);
  const html = renderToStaticMarkup(React.createElement(Workspace, { ...props, showGuide: false }));
  assert(html.includes('Original customer')); assert(html.includes('Save statement')); assert(!html.includes('Further learning'));
  assert.equal(JSON.stringify(props.action), before);
  const error = renderToStaticMarkup(React.createElement(Workspace, { ...props, showGuide: false, action: { ...props.action, taskFinding: { result: null, pending: false, error: 'HTTP 502 · provider_error · safe-trace' } } }));
  assert.match(error, /<details[^>]*open/); assert(error.includes('HTTP 502 · provider_error · safe-trace'));
});
