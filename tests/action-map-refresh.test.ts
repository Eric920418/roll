import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import { STEPS, MILESTONES, emptyFlowData } from '../src/lib/action-plan/flow/catalog';
import type { FlowView } from '../src/lib/action-plan/flow/service';

function fixture(revision = 1, completed = 0, current = 0): FlowView {
  const steps = STEPS.map((s, i) => ({ ...s, actionId: s.id, done: i < completed, current: i === completed ? current : 0, target: 10, data: emptyFlowData(s.kind), saved: true, reasons: [], summary: [] }));
  return { plan: { id: 'plan', revision, actions: steps.map(s => ({ id: s.id, done: s.done, milestoneId: `m${s.milestone}`, metric: { current: 0, target: 10 } })), roadmap: { goal: 'Goal', milestones: MILESTONES.map((m, i) => ({ id: `m${i}`, title: m[1], position: i, achievedAt: i < STEPS[completed]?.milestone ? '2026-11-14' : null, targetDate: '2026-12-14' })) } }, steps, current: steps.find(s => !s.done)?.id || null, archived: false, integrity: [], history: [], followups: [], leads: [], positioningReplies: [], proofStatus: [], weeks: [] } as unknown as FlowView;
}

test('Milestone bars reflect saved progress, retain confirmation gates, and advance the current milestone', () => {
  for (const locale of ['en', 'zh-tw']) {
    const load = pdfRuntime({ react: { ...React, useEffect() {}, useState: (v: unknown) => [v, () => {}], useRef: () => ({ current: null }) }, 'next-intl': { useLocale: () => locale }, '@/components/dashboard/PlanLocalization': { usePlanDisplay: () => ({ planText: (v: string) => v }) } });
    const Map = load<typeof import('../src/components/dashboard/ActionMap')>('src/components/dashboard/ActionMap.tsx').default;
    const plan = fixture().plan;
    function html() { return renderToStaticMarkup(React.createElement(Map, { userId: 'qa', plan, event: null, compact: true } as React.ComponentProps<typeof Map>, 'Steps')); }
    assert.match(html(), /aria-valuenow="0"/);
    plan.actions[0].metric!.current = 1;
    assert.match(html(), /aria-valuenow="2.5"/, 'One of ten conversations advances one of four milestone tasks');
    for (const a of plan.actions.slice(0, 4)) { a.metric!.current = 10; a.done = true; }
    assert.match(html(), /aria-valuenow="99"/, 'An unconfirmed legacy milestone cannot show 100%');
    plan.roadmap!.milestones[0].achievedAt = '2026-11-14';
    assert.match(html(), /aria-valuenow="100"/);
    const active = html().match(/<li\b[^>]*aria-current="step"[^>]*>[\s\S]*?<\/li>/)?.[0] || '';
    assert(active.includes(plan.roadmap!.milestones[1].title));
    assert(active.includes(locale === 'en' ? '02 · Current' : '02 · 目前階段'));
  }
});

function harness(initial = fixture(), locale = 'en') {
  const slots: unknown[] = [], effects: Array<() => void> = [], timers: Array<() => void> = [];
  let cursor = 0, props = initial.plan, server = initial, reads = 0;
  let pending: ((value: FlowView) => void) | null = null;
  const events = new EventTarget(), documentEvents = new EventTarget();
  const depsChanged = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || b.some((v, i) => v !== a[i]);
  const hooks = { ...React,
    useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (v: unknown) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useCallback(fn: unknown, deps: unknown[]) { const i = cursor++, old = slots[i] as { fn: unknown; deps: unknown[] } | undefined; if (depsChanged(old?.deps, deps)) slots[i] = { fn, deps }; return (slots[i] as { fn: unknown }).fn; },
    useEffect(fn: () => (() => void) | void, deps: unknown[]) { const i = cursor++, old = slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined; if (depsChanged(old?.deps, deps)) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); const cleanup = fn(); Object.assign(slots[i]!, { cleanup }); }); } },
    useEffectEvent(fn: (...args: unknown[]) => unknown) { const cell = hooks.useRef(fn) as { current: typeof fn }; cell.current = fn; return hooks.useCallback((...args: unknown[]) => cell.current(...args), []); },
  };
  const load = pdfRuntime({ react: hooks, 'next-intl': { useLocale: () => locale }, 'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/lib/member-fetch': { memberFetch: async (_url: string, init?: { method: string }) => { if (init?.method !== 'POST') { reads++; if (pending) return new Promise<FlowView>(resolve => { pending = resolve; }); } return structuredClone(server); } },
    '../ActionMap': { __esModule: true, default: 'Map' }, '../ActionPlanBuilder': { __esModule: true, default: 'Builder' }, './Templates': { __esModule: true, default: 'Templates', button: '', TextField: 'Field' }, './CurrentFindings': { __esModule: true, default: 'Findings' }, './PositioningEditor': { positioningPreview: () => '' }, '../LearningResources': { __esModule: true, default: 'Resources' }, './TaskAssist': { __esModule: true, default: 'Assist' }, './Proofs': { __esModule: true, default: 'Proofs' }, './Followups': { __esModule: true, default: 'Followups' },
  }, { window: Object.assign(events, { location: { hash: '', origin: 'http://localhost' } }), document: Object.assign(documentEvents, { visibilityState: 'visible', getElementById: () => null }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, requestAnimationFrame: (fn: () => void) => fn(), setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; }, clearTimeout() {}, crypto: { randomUUID: () => 'request' } });
  const Workspace = load<typeof import('../src/components/dashboard/flow/Workspace')>('src/components/dashboard/flow/Workspace.tsx').default;
  type Node = { type: unknown; props: Record<string, unknown> };
  type ChildProps = { Map: { plan: FlowView['plan'] }; Templates: React.ComponentProps<typeof import('../src/components/dashboard/flow/Templates').default> };
  let nodes: Node[] = [];
  function render() { cursor = 0; nodes = []; function visit(value: React.ReactNode) { React.Children.forEach(value, child => { if (React.isValidElement<{ children?: React.ReactNode }>(child)) { nodes.push(child as Node); visit(child.props.children); } }); } visit(Workspace({ userId: 'qa', plan: props, onChanged: p => { props = p; } })); return nodes; }
  async function settle() { for (let i = 0; i < 8; i++) { render(); effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); await Promise.resolve(); } render(); }
  return { settle, render, setServer: (v: FlowView) => { server = v; }, setProps: (v: FlowView) => { props = v.plan; }, reads: () => reads, event: (type: string) => events.dispatchEvent(new Event(type)), find: <K extends keyof ChildProps>(type: K) => nodes.find(n => n.type === type)!.props as ChildProps[K],
    defer() { pending = () => {}; }, resolve(v: FlowView) { const fn = pending; pending = null; fn?.(structuredClone(v)); } };
}

test('Flow reloads refreshed parent progress and milestone without reloading the page', async () => {
  const h = harness(); await h.settle();
  const next = fixture(2, 4, 2); h.setServer(next); h.setProps(next); await h.settle();
  assert.equal(h.find('Map').plan.revision, 2);
  assert.equal(h.find('Templates').step, '02-1');
  assert.equal(h.find('Map').plan.actions[4].metric!.current, 2, 'Use server-evaluated progress, not stale stored counters');
});

test('Conversation priority omits its duplicate button while other step actions and forms remain available', async () => {
  for (const locale of ['en', 'zh-tw']) for (const completed of [0, 1]) {
    const h = harness(fixture(1, completed), locale); await h.settle();
    const priority = h.render().find(n => Object.hasOwn(n.props, 'data-today-priority'))!;
    const content = JSON.stringify(priority);
    assert.equal(content.includes('"type":"button"'), completed === 1);
    assert(!content.includes('Record a conversation')); assert(!content.includes('記錄客戶對話'));
    assert.equal(h.find('Templates').step, STEPS[completed].id);
  }
});

test('Flow refresh preserves unsaved input and its original revision, including an in-flight focus refresh', async () => {
  const h = harness(); await h.settle();
  const draft = { ...h.find('Templates').data, market: 'US' };
  h.find('Templates').onChange(draft); await h.settle();
  const reads = h.reads(), next = fixture(2, 4, 2); h.setServer(next); h.setProps(next); h.event('focus'); await h.settle();
  assert.equal(h.reads(), reads); assert.equal((h.find('Templates').data as { market: string }).market, 'US'); assert.equal(h.find('Map').plan.revision, 1);
  const clean = harness(); await clean.settle(); clean.defer(); clean.event('focus'); await clean.settle();
  assert.equal(clean.reads(), 2, 'Returning to the page refreshes clean progress');
  clean.find('Templates').onChange(draft); clean.resolve(next); await clean.settle();
  assert.equal((clean.find('Templates').data as { market: string }).market, 'US'); assert.equal(clean.find('Map').plan.revision, 1);
});
