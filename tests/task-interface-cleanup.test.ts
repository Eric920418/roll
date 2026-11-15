import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import { flowMilestones } from '../src/lib/action-plan/flow/catalog';
import type { FlowView } from '../src/lib/action-plan/flow/service';
import type { ActionPlanDto } from '../src/lib/action-plan/service';
import type { ActionPlanActionDto } from '../src/lib/action-plan/ranking';

const hooks = { ...React, useEffect() {}, useRef: () => ({ current: null }), useState: (v: unknown) => [v, () => {}] };
const localization = { usePlanDisplay: () => ({ planText: (v: string) => v }) };

test('Compact chats keep messages and errors, separate composer actions, and hide unavailable controls', () => {
  for (const locale of ['en', 'zh-tw']) for (const status of ['accepted', 'blocked', 'pending']) for (const unread of [0, 2]) {
    const zh = locale === 'zh-tw', connection = { id: 'chat', company: 'Unicorn Tutor', profileId: 'company', status, outgoing: unread === 0, unread, revision: 1, verified: true, role: 'investor', sharing: { revision: 1, sections: [] }, watches: [], tokenFee: { amount: 5, status: status === 'pending' ? 'reserved' : 'captured', expiresAt: '2026-11-21T12:00:00Z', opening: 'Original invitation' } };
    const messages = [{ id: 'one', mine: true, body: 'Original outgoing message', createdAt: '2026-11-14T12:00:00Z' }, { id: 'two', mine: false, body: 'Original incoming message', createdAt: '2026-11-14T12:01:00Z' }, { id: 'report', mine: false, body: 'https://rollon.com.tw/task-report/owned?token=qa', createdAt: '2026-11-14T12:02:00Z' }, { id: 'unsafe', mine: false, body: 'javascript:alert(1)', createdAt: '2026-11-14T12:03:00Z' }];
    const failure = 'HTTP 503 · send_failed · trace-123\nFull original error';
    const states = [{ enabled: true, portal: true }, '', [connection], 'chat', messages, unread ? 'older' : null, 'Unsaved draft', failure, false, { revision: 1, sections: [], workspace: '' }, null];
    const before = JSON.stringify(states); let slot = 0;
    const load = pdfRuntime({ react: { ...hooks, useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [slot < states.length ? states[slot++] : value, () => {}] },
      'next-intl': { useLocale: () => locale }, 'next/navigation': { useSearchParams: () => new URLSearchParams() }, 'next/link': { __esModule: true, default: 'a' }, '../evidence/Preferences': { default: () => null }, './ViewerOverview': { default: () => null }, '../matchmaking/CardView': { PrivatePhoto: () => null }, '@/lib/network/policy': { SECTIONS: ['profile'] },
    });
    const Inbox = load<typeof import('../src/components/dashboard/network/NetworkPanels')>('src/components/dashboard/network/NetworkPanels.tsx').MessagesPage;
    const html = renderToStaticMarkup(React.createElement(Inbox, { userId: 'owner', embedded: true }));
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
    assert(!visible.includes('Reload')); assert(!visible.includes('Company card')); assert(!visible.includes('Your invitation fee'));
    assert(!visible.includes('5 Token')); assert(!visible.includes('Paid')); assert(!visible.includes('已扣款'));
    assert.equal(visible.includes('Original invitation'), status === 'pending');
    assert.equal(visible.includes(zh ? '未回覆退回時間' : 'Unanswered hold expires'), status === 'pending');
    assert(visible.includes(failure)); assert(html.includes('/dashboard/matchmaking/company'));
    assert(!visible.includes('Block and stop private sharing')); assert(!/<details[^>]*\bopen/.test(html));
    if (status !== 'pending') {
      for (const m of messages) assert(visible.includes(m.body));
      assert.equal(visible.includes(zh ? '更早訊息' : 'Earlier messages'), unread > 0);
      assert.equal(visible.includes(zh ? '標為已讀' : 'Mark read'), unread > 0);
      assert(visible.includes('dateTime="2026-11-14T12:00:00Z"'));
      assert(visible.includes('href="https://rollon.com.tw/task-report/owned?token=qa"')); assert(visible.includes('rel="noopener noreferrer"'));
      assert(!visible.includes('href="javascript:'));
    }
    if (status === 'accepted') {
      assert(visible.includes('data-chat-composer')); assert(visible.includes('Unsaved draft')); assert(visible.includes('rows="1"'));
      assert(visible.includes(zh ? '分享報告' : 'Share report')); assert(html.includes('Confirm sharing consent') || html.includes('確認同意分享'));
      assert(visible.indexOf(zh ? '分享報告' : 'Share report') < visible.indexOf('<textarea'));
      assert(visible.indexOf('<textarea') < visible.indexOf(zh ? '傳送</button>' : 'Send</button>'));
    } else assert(!visible.includes('<textarea'));
    assert.equal(JSON.stringify(states), before);
  }
});

test('Chat report sharing checks eligibility, inserts only confirmed links, and retains full retry errors', async () => {
  for (const locale of ['en', 'zh-tw']) {
    const zh = locale === 'zh-tw', state: unknown[] = [], calls: Array<{ path: string; input?: { method?: string; body?: string } }> = [], inserted: string[] = [];
    let slot = 0, confirms = 0, consent = true, fail = false, disabled = false, wait: Promise<void> | null = null;
    const view = { plan: { id: 'owned-plan', revision: 7, workflowVersion: 2 }, archived: false, steps: Array.from({ length: 16 }, () => ({ done: true, ready: true })) };
    const load = pdfRuntime({ react: { ...hooks, useState: (initial: unknown) => { const i = slot++; if (!(i in state)) state[i] = initial; return [state[i], (next: unknown) => { state[i] = next; }]; } },
      'next-intl': { useLocale: () => locale }, 'next/link': { __esModule: true, default: 'a' },
      '@/lib/member-fetch': { memberFetch: async (path: string, input?: { method?: string; body?: string }) => {
        calls.push({ path, input });
        if (!input) { if (wait) await wait; return view; }
        if (fail) throw new Error('HTTP 409\nPlan revision changed\nconflict\ntrace-share');
        return { ...view, link: '/task-report/report-id?token=confirmed-token' };
      } },
    }, { window: { location: { origin: 'https://example.test' }, confirm: () => { confirms++; return consent; } }, Error });
    const Report = load<typeof import('../src/components/dashboard/network/ReportDraft')>('src/components/dashboard/network/ReportDraft.tsx').default;
    function render() { slot = 0; return Report({ disabled, onInsert: value => inserted.push(value) }); }
    function click() { const root = render(); const button = React.Children.toArray(root.props.children).find(child => React.isValidElement(child) && child.type === 'button') as React.ReactElement<{ onClick(): void }>; button.props.onClick(); }
    const html = () => renderToStaticMarkup(render());
    const settle = () => new Promise(resolve => setImmediate(resolve));
    const blocked = async (pattern: RegExp) => {
      const start = calls.length, before = confirms;
      click(); await settle();
      assert.match(html(), pattern); assert.match(html(), zh ? /查看今日任務/ : /View today’s tasks/);
      assert.match(html(), new RegExp(`href="${zh ? '/zh-tw' : ''}/dashboard/agenda"`));
      assert.equal(calls.length, start + 1); assert.equal(confirms, before); assert.equal(inserted.length, 0);
    };
    view.plan.workflowVersion = 1; const steps = view.steps; view.steps = [];
    click(); await settle();
    assert.equal(inserted.length, 1); assert.match(inserted[0], zh ? /我的進度報告/ : /My progress report/);
    assert.equal(JSON.parse(calls.at(-1)!.input!.body!).enabled, true);
    inserted.length = 0; view.steps = steps;
    view.plan.workflowVersion = 2; view.archived = true; await blocked(zh ? /已封存/ : /archived/);
    view.archived = false; view.steps[0].done = false; await blocked(zh ? /完成十六步後/ : /Complete all sixteen steps/);
    view.steps[0].done = true; view.steps[0].ready = false; await blocked(zh ? /證據需補正/ : /evidence needs attention/);
    view.steps[0].ready = true; consent = false;
    click(); await settle(); assert.equal(inserted.length, 0); assert(!calls.at(-1)!.input);

    consent = true; fail = true; click(); await settle();
    for (const detail of ['HTTP 409', 'Plan revision changed', 'conflict', 'trace-share']) assert(html().includes(detail));
    assert.equal(inserted.length, 0);
    fail = false; view.plan.revision = 8;
    let release!: () => void; wait = new Promise<void>(resolve => { release = resolve; });
    click(); assert.match(html(), zh ? /準備分享/ : /Preparing report/); assert.match(html(), /disabled=""/);
    release(); await settle(); wait = null;
    assert.equal(inserted.length, 1);
    assert(inserted[0].includes(`https://example.test${zh ? '/zh-tw' : ''}/task-report/report-id?token=confirmed-token`));
    assert.deepEqual(JSON.parse(calls.at(-1)!.input!.body!), { action: 'share', enabled: true, planId: 'owned-plan', revision: 8 });
    assert(calls.every(call => call.path === `/api/action-plans/flow?locale=${locale}`), 'Sharing never sends a chat message');
    assert.match(html(), zh ? /已放入訊息草稿/ : /Report link added to your message draft/); assert.doesNotMatch(html(), /HTTP 409|trace-share/);
    disabled = true; assert.match(html(), /disabled=""/);
  }
});

test('Previous findings show only headlines by default and retain full details and visible errors', () => {
  for (const locale of ['en', 'zh-tw']) {
    const load = pdfRuntime({ react: hooks, 'next-intl': { useLocale: () => locale }, '@/components/dashboard/PlanLocalization': localization, './CustomerDiscovery': { default: () => null } });
    const Findings = load<typeof import('../src/components/dashboard/InterviewWorkspace')>('src/components/dashboard/InterviewWorkspace.tsx').CompletedTaskInsights;
    const cards = [{ title: 'Unvalidated ICP slows GTM', text: 'Original customer evidence, including TattooLab.' }, { title: 'Trials fail to convert', text: 'Original trial conversion details.' }];
    const action = { id: 'qa', displayNumber: 1, title: 'Document the target customer profile', taskFinding: { source: 'ai', result: { cards, why: 'Original next-step reasoning.' }, error: 'HTTP 503 · trace-123\nFull provider failure' } } as unknown as ActionPlanActionDto;
    const before = JSON.stringify(action);
    const html = renderToStaticMarkup(React.createElement(Findings, { action }));
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
    for (const card of cards) { assert(visible.includes(card.title)); assert(!visible.includes(card.text)); assert(html.includes(card.text)); }
    assert(!visible.includes(action.title)); assert(html.includes(action.title));
    assert(!visible.includes(action.taskFinding!.result!.why)); assert(html.includes(action.taskFinding!.result!.why));
    assert(!html.includes('Reference for your next task')); assert(!html.includes('供下一項任務參考'));
    assert(!/<details[^>]*\bopen/.test(html)); assert(visible.includes(action.taskFinding!.error!));
    assert(visible.includes('role="alert"')); assert.equal(JSON.stringify(action), before);
  }
});

test('Five milestone names and dates remain visible without a duplicate step disclosure', () => {
  for (const locale of ['en', 'zh-tw']) {
    const load = pdfRuntime({ react: hooks, 'next-intl': { useLocale: () => locale }, '@/components/dashboard/PlanLocalization': localization });
    const Map = load<typeof import('../src/components/dashboard/ActionMap')>('src/components/dashboard/ActionMap.tsx').default;
    const milestones = flowMilestones('2026-11-14', '2027-11-14', locale).map((m, position) => ({ ...m, id: String(position), position, achievedAt: null }));
    const plan = { id: 'qa', actions: [], roadmap: { milestones } } as unknown as ActionPlanDto;
    const before = JSON.stringify(plan);
    const html = renderToStaticMarkup(React.createElement(Map, { userId: 'qa', plan, compact: true, event: null }));
    assert.equal((html.match(/<li\b/g) || []).length, 5);
    for (const m of milestones) { assert(html.includes(m.title)); assert(html.includes(m.targetDate)); }
    assert(html.includes('2027-07-16')); assert(html.includes('2027-11-14'));
    assert(!html.includes('<details')); assert(!html.includes('Expand steps')); assert.equal(JSON.stringify(plan), before);
  }
});

test('Current findings omit empty or insufficient evidence and retain real source wording', () => {
  const load = pdfRuntime({ react: React });
  const Findings = load<typeof import('../src/components/dashboard/flow/CurrentFindings')>('src/components/dashboard/flow/CurrentFindings.tsx').default;
  for (const locale of ['en', 'zh-tw']) {
    for (const count of [0, 2, 3]) {
      const leads = Array.from({ length: count }, (_, i) => ({ id: String(i), company: `Company ${i}`, name: `Buyer ${i}`, pain: 'Manual reporting takes hours', quote: 'Original customer wording', date: '2026-11-14', relationship: 'stranger', fit: 'yes' }));
      const view = { leads } as unknown as FlowView, before = JSON.stringify(view);
      const html = renderToStaticMarkup(React.createElement(Findings, { view, locale }));
      if (count < 3) assert.equal(html, '');
      else { assert(html.includes(locale === 'en' ? 'Key findings' : '關鍵發現')); assert(html.includes('Original customer wording')); }
      assert.equal(JSON.stringify(view), before);
    }
    const unclassified = { leads: Array.from({ length: 3 }, (_, i) => ({ id: String(i), company: `Company ${i}`, name: `Buyer ${i}`, pain: '', quote: '', date: '2026-11-14', relationship: 'stranger', fit: 'yes' })) } as unknown as FlowView;
    assert.equal(renderToStaticMarkup(React.createElement(Findings, { view: unclassified, locale })), '');
  }
});

test('Legacy findings hide empty results while keeping complete failures and retry available', () => {
  for (const locale of ['en', 'zh-tw']) for (const error of ['', 'HTTP 503 · provider_error · trace-123\nOriginal failure detail']) {
    let slot = 0;
    const load = pdfRuntime({ react: { ...hooks, useState: () => [slot++ === 0 ? { top: [], total: 0 } : slot === 2 ? error : 0, () => {}] }, 'next-intl': { useLocale: () => locale }, '@/components/dashboard/PlanLocalization': localization, './CustomerDiscovery': { default: () => null } });
    const Findings = load<typeof import('../src/components/dashboard/InterviewWorkspace')>('src/components/dashboard/InterviewWorkspace.tsx').InterviewFindings;
    const html = renderToStaticMarkup(React.createElement(Findings, { actionId: 'qa' }));
    if (!error) assert.equal(html, '');
    else { assert(html.includes('role="alert"')); assert(html.includes(error)); assert(html.includes(locale === 'en' ? 'Retry' : '重試')); }
  }
});
