import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import { STEPS, MILESTONES, TEMPLATE_NAMES, emptyFlowData } from '../src/lib/action-plan/flow/catalog';
import type { FlowView } from '../src/lib/action-plan/flow/service';

function fixture(revision = 1, completed = 0, current = 0): FlowView {
  const steps = STEPS.map((s, i) => ({ ...s, actionId: s.id, done: i < completed, current: i === completed ? current : 0, target: 10, data: emptyFlowData(s.kind), saved: true, reasons: [], summary: [] }));
  return { plan: { id: 'plan', revision, nextMoves: [], actions: steps.map(s => ({ id: s.id, done: s.done, dependency: { blocked: false }, milestoneId: `m${s.milestone}`, metric: { current: 0, target: 10 } })), roadmap: { goal: 'Goal', milestones: MILESTONES.map((m, i) => ({ id: `m${i}`, title: m[1], position: i, achievedAt: i < STEPS[completed]?.milestone ? '2026-11-14' : null, targetDate: '2026-12-14' })) } }, steps, current: steps.find(s => !s.done)?.id || null, archived: false, integrity: [], history: [], followups: [], leads: [], criteria: [], tiers: [], payments: [], channels: [], positioningReplies: [], proofStatus: [], weeks: [], metrics: { currency: 'USD', customers: 0, eligible: 0, renewed: 0, renewalRate: null, averageRevenue: 0, acquisitionCost: null, revenue: 0 }, searchTokens: { recordedOrders: 0, spent: 0, reserved: 0 }, weekly: { currency: 'USD', target: 0, weeklyContacts: 0, weeklyConversations: 0 } } as unknown as FlowView;
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

function harness(initial = fixture(), locale = 'en', hash = '', write?: (payload: { action: string; revision: number }) => FlowView) {
  const slots: unknown[] = [], effects: Array<() => void> = [], timers: Array<() => void> = [];
  let cursor = 0, props = initial.plan, server = initial, reads = 0, writes = 0;
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
    '@/lib/member-fetch': { memberFetch: async (_url: string, init?: { method: string; body?: string }) => { if (init?.method !== 'POST') { reads++; if (pending) return new Promise<FlowView>(resolve => { pending = resolve; }); } else { writes++; if (write) return structuredClone(write(JSON.parse(init.body!))); } return structuredClone(server); } },
    '../ActionMap': { __esModule: true, default: 'Map' }, '../ActionPlanBuilder': { __esModule: true, default: 'Builder' }, './Templates': { __esModule: true, default: 'Templates', button: '', TextField: 'Field' }, './OrganizeWork': { __esModule: true, default: 'OrganizeWork', TaskRoadmap: 'TaskRoadmap', TaskSection: 'TaskSection' }, './CurrentFindings': { __esModule: true, default: 'Findings' }, './PositioningEditor': { positioningPreview: () => '' }, '../LearningResources': { __esModule: true, default: 'Resources' }, './TaskAssist': { __esModule: true, default: 'Assist' }, './Proofs': { __esModule: true, default: 'Proofs' }, './Followups': { __esModule: true, default: 'Followups' },
  }, { window: Object.assign(events, { location: { hash, origin: 'http://localhost' } }), document: Object.assign(documentEvents, { visibilityState: 'visible', getElementById: () => null }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, requestAnimationFrame: (fn: () => void) => fn(), setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; }, clearTimeout() {}, crypto: { randomUUID: () => 'request' } });
  const Workspace = load<typeof import('../src/components/dashboard/flow/Workspace')>('src/components/dashboard/flow/Workspace.tsx').default;
  type Node = { type: unknown; props: Record<string, unknown> };
  type ChildProps = { Map: { plan: FlowView['plan'] }; Templates: React.ComponentProps<typeof import('../src/components/dashboard/flow/Templates').default> };
  let nodes: Node[] = [];
  function render() { cursor = 0; nodes = []; function visit(value: React.ReactNode) { React.Children.forEach(value, child => { if (React.isValidElement<{ children?: React.ReactNode }>(child)) { nodes.push(child as Node); visit(child.props.children); } }); } visit(Workspace({ userId: 'qa', plan: props, onChanged: p => { props = p; } })); return nodes; }
  async function settle() { for (let i = 0; i < 8; i++) { render(); effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); await Promise.resolve(); } render(); }
  return { settle, render, setServer: (v: FlowView) => { server = v; }, setProps: (v: FlowView) => { props = v.plan; }, reads: () => reads, writes: () => writes, event: (type: string) => events.dispatchEvent(new Event(type)), find: <K extends keyof ChildProps>(type: K) => nodes.find(n => n.type === type || type === 'Templates' && n.type === 'OrganizeWork')!.props as ChildProps[K],
    defer() { pending = () => {}; }, resolve(v: FlowView) { const fn = pending; pending = null; fn?.(structuredClone(v)); } };
}

test('Owned positioning and criteria links open read-only previews without completing earlier work or writing', async () => {
  for (const locale of ['en', 'zh-tw']) for (const step of ['01-2', '01-3']) {
    const view = fixture(), before = JSON.stringify(view), h = harness(view, locale, '#action-' + step); await h.settle();
    assert.equal(h.find('Templates').step, step); assert.equal(h.find('Templates').readOnly, true);
    const text = JSON.stringify(h.render()); assert(text.includes(locale === 'en' ? 'Read-only preview' : '唯讀預覽'));
    assert(!text.includes(locale === 'en' ? 'This completed result is retained' : '此步驟的完成成果已保留'));
    assert(!text.includes(locale === 'en' ? 'Confirm and complete' : '確認並完成'));
    assert.equal(h.writes(), 0); assert.equal(view.current, '01-1'); assert.equal(JSON.stringify(view), before);
    h.event('focus'); await h.settle(); assert.equal(h.find('Templates').step, step); assert.equal(h.find('Templates').readOnly, true);
  }
  for (const hash of ['#action-foreign-account', '#action-02-2', '#action-03-1']) {
    const h = harness(fixture(), 'en', hash); await h.settle(); assert.equal(h.find('Templates').step, '01-1'); assert.equal(h.writes(), 0);
  }
});

test('Flow reloads refreshed parent progress and milestone without reloading the page', async () => {
  const h = harness(); await h.settle();
  const next = fixture(2, 4, 2); h.setServer(next); h.setProps(next); await h.settle();
  assert(!h.render().some(n => n.type === 'Map'), 'The moved map no longer appears in the task workspace');
  assert.equal(h.find('Templates').step, '02-1');
  assert.equal(h.find('Templates').view.steps[4].current, 2, 'Use server-evaluated progress, not stale stored counters');
});

test('First conversation step has only the reference sections and completes from Save when the server is ready', async () => {
  for (const locale of ['en', 'zh-tw']) for (const ready of [false, true]) {
    const plan = fixture();
    const data = plan.steps[0].data;
    assert(data.kind === 'conversation');
    data.market = 'TW';
    const writes: Array<{ action: string; revision: number }> = [];
    const h = harness(plan, locale, '', payload => {
      writes.push(payload);
      const next = fixture(writes.length + 1, Number(payload.action === 'complete'));
      next.steps[0] = { ...next.steps[0], data, ready };
      return next;
    });
    await h.settle();
    const nodes = h.render(), strings = JSON.stringify(nodes);
    const headings = nodes.filter(n => n.type === 'TaskSection').map(n => n.props.number);
    assert.deepEqual(headings, ['01', '02', '04']);
    assert(nodes.some(n => n.type === 'Findings' && n.props.reference));
    assert(nodes.some(n => n.type === 'TaskRoadmap'));
    assert.match(strings, /Record a customer conversation|記錄客戶對話/);
    assert.doesNotMatch(strings, /Confirm and complete|確認並完成|Save this step|儲存本步成果/);
    const save = nodes.find(n => n.type === 'button' && typeof n.props.onClick === 'function' && n.props.children === (locale === 'en' ? 'Save conversation' : '儲存紀錄'))!;
    assert.equal(typeof save.props.onClick, 'function');
    (save.props.onClick as () => void)();
    await h.settle();
    assert.deepEqual(writes.map(({ action, revision }) => [action, revision]), ready ? [['save', 1], ['complete', 2]] : [['save', 1]]);
    assert.equal(h.find('Templates').step, ready ? '01-2' : '01-1');
  }
});

test('Flow refresh preserves unsaved input and its original revision, including an in-flight focus refresh', async () => {
  const h = harness(); await h.settle();
  const draft = { ...h.find('Templates').data, market: 'US' };
  h.find('Templates').onChange(draft); await h.settle();
  const reads = h.reads(), next = fixture(2, 4, 2); h.setServer(next); h.setProps(next); h.event('focus'); await h.settle();
  assert.equal(h.reads(), reads); assert.equal((h.find('Templates').data as { market: string }).market, 'US'); assert.equal(h.find('Templates').step, '01-1');
  const clean = harness(); await clean.settle(); clean.defer(); clean.event('focus'); await clean.settle();
  assert.equal(clean.reads(), 2, 'Returning to the page refreshes clean progress');
  clean.find('Templates').onChange(draft); clean.resolve(next); await clean.settle();
  assert.equal((clean.find('Templates').data as { market: string }).market, 'US'); assert.equal(clean.find('Templates').step, '01-1');
});

test('Prepared participant links survive a clean focus refresh and remain isolated to their step', async () => {
  const view = Object.assign(fixture(1, 1), { links: [{ leadId: 'participant', href: '/task-confirm/qa?token=synthetic' }] });
  const h = harness(view); await h.settle();
  const work = () => h.render().find(n => n.type === 'OrganizeWork')!.props;
  (work().onLinks as (ids: string[], save: boolean) => void)(['participant'], false); await h.settle();
  assert.equal((work().links as unknown[]).length, 1);
  h.event('focus'); await h.settle();
  assert.equal((work().links as unknown[]).length, 1, 'Reading replies must not discard prepared messages');
  const next = fixture(2, 2); h.setServer(next); h.setProps(next); await h.settle();
  assert.equal((work().links as unknown[]).length, 0);
});

test('All sixteen steps use the PDF sections, with one map and company search only where specified', async () => {
  for (const locale of ['en', 'zh-tw']) for (const [index, spec] of STEPS.entries()) {
    const view = fixture(1, index);
    const original = view.steps[0].data; if (original.kind === 'conversation') original.market = 'TW';
    const current = view.steps[index].data; if (spec.id === '05-2' && current.kind === 'outreach') current.market = 'Japan';
    const positioning = view.steps[1].data;
    if (positioning.kind === 'organize') { positioning.values.positioning = 'A confirmed positioning statement'; positioning.confirmed = ['positioning']; }
    view.criteria = [{ id: 'confirmed', label: 'Confirmed buying criterion', weight: 50, sources: ['a', 'b', 'c'], confirmed: true }, { id: 'observed', label: 'Observation only', weight: 50, sources: ['a'], confirmed: true }];
    const before = JSON.stringify(view), h = harness(view, locale); await h.settle();
    const tree = h.render(), badge = tree.find(n => Object.hasOwn(n.props, 'data-task-type'));
    assert.equal(badge?.props.children, TEMPLATE_NAMES[spec.kind][locale === 'zh-tw' ? 0 : 1]);
    const search = tree.find(n => n.props.stepContext)?.props.stepContext as { step: string; market: string; description: string } | undefined;
    assert.equal(Boolean(search), ['01-1', '03-1', '04-1', '05-2'].includes(spec.id));
    if (search) { assert.equal(search.step, spec.id); assert.equal(search.market, spec.id === '05-2' ? 'Japan' : 'TW'); assert.match(search.description, /Confirmed buying criterion/); assert(!search.description.includes('Observation only')); }
    const priority = tree.find(n => Object.hasOwn(n.props, 'data-today-priority'));
    assert.match(JSON.stringify(priority), /Completion criteria|完成標準/);
    assert.equal(tree.filter(n => n.type === "TaskRoadmap").length, 1);
    const text = JSON.stringify(tree.filter(n => n.type === "button").map(n => n.props.children));
    assert.doesNotMatch(text, /Previous step|上一步|Rebuild draft|重新整理初稿|thirteen weeks created|每週開發待辦/);
    const headings = tree.filter(n => n.type === 'TaskSection').map(n => n.props.number);
    assert.deepEqual(headings, ["01", ...(["01-2", "01-3"].includes(spec.id) ? [] : ["02"]), ...(search ? ["04"] : [])]);
    assert.equal(tree.filter(n => n.type === "Assist").length, spec.id === "01-1" ? 1 : 0);
    assert.equal(JSON.stringify(view), before);
  }
});
