import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as React from 'react';
import { pdfRuntime } from './helpers/pdf-runtime';

type SearchProps = React.ComponentProps<typeof import('../src/components/dashboard/prospecting/ProspectSearch').default>;
const target = 'Confirmed reporting buyers';
const order = (name: string, country: string, description: string) => ({ id: randomUUID(), submissionId: randomUUID(), country, description, status: 'completed', createdAt: '2026-11-01T00:00:00Z', requested: 5, delivered: 5, usable: 1, needsRecheck: false, companies: [{ id: randomUUID(), name, quality: 'strong', website: 'https://example.com', contact: { kind: 'page', value: 'https://example.com/contact', source: 'https://example.com/contact' }, evidence: [] }] });
function harness(locale: string, stepContext?: SearchProps['stepContext'], storage = new Map<string, string>()) {
  const slots: unknown[] = [], effects: Array<() => void> = [], timers: Array<() => void> = [], posts: Array<Record<string, unknown>> = [];
  let cursor = 0, fail = false;
  const server = { enabled: true, pricing: { version: 1, searchFee: 20 }, workspace: { revision: 3, country: 'TW', description: 'Unrelated shared workspace', suggested: 'Saved buyer evidence' }, access: { canSearch: true, fullAccess: true }, quota: { remaining: 100 }, orders: [order('Old Taiwan company', 'TW', target), order('Wrong Japan conditions', 'JP', 'Other buyer criteria'), order('Matching Japan company', 'JP', target)], pending: null, nextCursor: null };
  const changed = (a: unknown[] | undefined, b: unknown[]) => !a || a.length !== b.length || b.some((v, i) => v !== a[i]);
  const hooks = { ...React,
    useId: () => 'search-title',
    useState(value: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], (v: unknown) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useCallback(fn: unknown, deps: unknown[]) { const i = cursor++, old = slots[i] as { fn: unknown; deps: unknown[] } | undefined; if (changed(old?.deps, deps)) slots[i] = { fn, deps }; return (slots[i] as { fn: unknown }).fn; },
    useEffect(fn: () => (() => void) | void, deps: unknown[]) { const i = cursor++, old = slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined; if (changed(old?.deps, deps)) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); Object.assign(slots[i]!, { cleanup: fn() }); }); } },
  };
  class FetchError extends Error { constructor(message: string, public status: number) { super(message); } }
  const load = pdfRuntime({ react: hooks, 'next-intl': { useLocale: () => locale }, '@/components/ui/CountrySelect': { __esModule: true, default: 'CountrySelect' }, '@/lib/analytics': { track() {} }, '../PlanRefresh': { notifyPlanChanged() {} }, '@/lib/member-fetch': { MemberFetchError: FetchError, memberFetch: async (_url: string, init?: { method: string; body: string }) => {
    if (init?.method === 'POST') { const body = JSON.parse(init.body); posts.push(body); if (fail) throw new FetchError('HTTP 503\nsearch_retry\ntrace-search', 503); const next = { ...order('New delivered company', body.country, body.description), submissionId: body.requestId }; server.orders.unshift(next); return { id: next.id }; }
    return structuredClone(server);
  } } }, { crypto: { randomUUID }, window: Object.assign(new EventTarget(), { setInterval: () => 1, location: { hash: '' } }), document: Object.assign(new EventTarget(), { visibilityState: 'visible' }), BroadcastChannel: undefined, HTMLDialogElement: class {}, localStorage: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, sessionStorage: { getItem: () => null, setItem() {} }, setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; }, clearTimeout() {}, clearInterval() {} });
  const Search = load<typeof import('../src/components/dashboard/prospecting/ProspectSearch')>('src/components/dashboard/prospecting/ProspectSearch.tsx').default;
  type Node = { type: unknown; props: Record<string, unknown> };
  function render() { cursor = 0; const nodes: Node[] = []; function visit(value: React.ReactNode) { React.Children.forEach(value, child => { if (React.isValidElement<{ children?: React.ReactNode }>(child)) { nodes.push(child as Node); visit(child.props.children); } }); } visit(Search({ userId: 'owner', planId: 'plan', compact: true, stepContext })); return nodes; }
  function find(type: unknown) { const node = render().find(n => n.type === type); assert(node); return node.props; }
  async function settle() { for (let i = 0; i < 8; i++) { render(); effects.splice(0).forEach(fn => fn()); timers.splice(0).forEach(fn => fn()); await Promise.resolve(); } }
  return { render, settle, posts, storage, fail: (value: boolean) => { fail = value; }, country: () => find('CountrySelect').value,
    description: () => find('textarea').value,
    editCountry: (value: string) => (find('CountrySelect').onChange as (value: string) => void)(value),
    editDescription: (value: string) => (find('textarea').onChange as (e: { target: { value: string } }) => void)({ target: { value } }),
    submit: () => (find('form').onSubmit as (e: { preventDefault(): void }) => void)({ preventDefault() {} }),
  };
}

test('Step search excludes previous markets and conditions, isolates drafts, and preserves retry identity and complete errors', async () => {
  for (const locale of ['en', 'zh-tw']) {
    const storage = new Map([['nova:prospects:owner:plan', JSON.stringify({ country: 'TW', description: 'Previous plan draft' })]]);
    const context = { step: '05-2', market: '日本', description: target }, h = harness(locale, context, storage); await h.settle();
    assert.equal(h.country(), 'JP'); assert.equal(h.description(), target); assert.equal(h.posts.length, 0);
    const table = h.render().find(n => n.type === 'table'); assert(table);
    const text = JSON.stringify(table.props.children); assert.match(text, /Matching Japan company/); assert.doesNotMatch(text, /Old Taiwan company|Wrong Japan conditions/);
    h.editDescription('Manually refined Japan buyers'); await h.settle();
    h.editCountry('TW'); h.submit(); await h.settle(); assert.equal(h.posts.length, 0);
    assert.match(JSON.stringify(h.render()), /search country must match|搜尋國家須與本步市場一致/);
    h.editCountry('JP'); h.fail(true); h.submit(); await h.settle();
    assert.match(JSON.stringify(h.render()), /HTTP 503/); assert.match(JSON.stringify(h.render()), /trace-search/);
    const retry = harness(locale, context, storage); await retry.settle();
    assert.equal(retry.description(), 'Manually refined Japan buyers'); retry.submit(); await retry.settle();
    assert.equal(retry.posts[0].requestId, h.posts[0].requestId); assert.equal(retry.posts[0].country, 'JP');
    assert.equal(retry.posts[0].planId, 'plan'); assert.equal(retry.posts[0].description, 'Manually refined Japan buyers');
    assert.equal(retry.description(), 'Manually refined Japan buyers');
    const restored = harness(locale, context, storage); await restored.settle(); assert.equal(restored.description(), 'Manually refined Japan buyers');
    const firstMarket = harness(locale, { step: '03-1', market: 'TW', description: target }, storage); await firstMarket.settle();
    assert.equal(firstMarket.country(), 'TW'); assert.equal(firstMarket.description(), target);
    assert.equal(JSON.parse(storage.get('nova:prospects:owner:plan')!).description, 'Previous plan draft');
  }
});

test('Unknown task markets require a chosen country while unscoped search retains the shared workspace', async () => {
  const scoped = harness('en', { step: '05-2', market: 'Enterprise segment', description: target }); await scoped.settle();
  assert.equal(scoped.country(), ''); scoped.submit(); await scoped.settle(); assert.equal(scoped.posts.length, 0);
  scoped.editCountry('US'); scoped.submit(); await scoped.settle(); assert.equal(scoped.posts[0].country, 'US');
  const shared = harness('en'); await shared.settle(); assert.equal(shared.country(), 'TW'); assert.equal(shared.description(), 'Unrelated shared workspace');
});
