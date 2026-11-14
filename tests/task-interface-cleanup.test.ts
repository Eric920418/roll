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
    const messages = [{ id: 'one', mine: true, body: 'Original outgoing message', createdAt: '2026-11-14T12:00:00Z' }, { id: 'two', mine: false, body: 'Original incoming message', createdAt: '2026-11-14T12:01:00Z' }];
    const failure = 'HTTP 503 · send_failed · trace-123\nFull original error';
    const states = [{ enabled: true, portal: true }, '', [connection], 'chat', messages, unread ? 'older' : null, 'Unsaved draft', failure, false, { revision: 1, sections: [], workspace: '' }, null];
    const before = JSON.stringify(states); let slot = 0;
    const load = pdfRuntime({ react: { ...hooks, useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [slot < states.length ? states[slot++] : value, () => {}] },
      'next-intl': { useLocale: () => locale }, 'next/navigation': { useSearchParams: () => new URLSearchParams() }, 'next/link': { __esModule: true, default: 'a' }, '../evidence/Preferences': { default: () => null }, './ViewerOverview': { default: () => null }, '../matchmaking/CardView': { PrivatePhoto: () => null }, '@/lib/network/policy': { SECTIONS: ['profile'] },
    });
    const Inbox = load<typeof import('../src/components/dashboard/network/NetworkPanels')>('src/components/dashboard/network/NetworkPanels.tsx').MessagesPage;
    const html = renderToStaticMarkup(React.createElement(Inbox, { embedded: true }));
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
    assert(!visible.includes('Reload')); assert(!visible.includes('Company card')); assert(!visible.includes('Your invitation fee'));
    assert(visible.includes(failure)); assert(html.includes('/dashboard/matchmaking/company'));
    assert(!visible.includes('Block and stop private sharing')); assert(!/<details[^>]*\bopen/.test(html));
    if (status !== 'pending') {
      for (const m of messages) assert(visible.includes(m.body));
      assert.equal(visible.includes(zh ? '更早訊息' : 'Earlier messages'), unread > 0);
      assert.equal(visible.includes(zh ? '標為已讀' : 'Mark read'), unread > 0);
      assert(visible.includes('dateTime="2026-11-14T12:00:00Z"'));
    }
    if (status === 'accepted') {
      assert(visible.includes('data-chat-composer')); assert(visible.includes('Unsaved draft')); assert(visible.includes('rows="2"'));
      assert(visible.includes(zh ? '分享報告' : 'Share report')); assert(html.includes('Confirm sharing consent') || html.includes('確認同意分享'));
      assert(visible.indexOf(zh ? '分享報告' : 'Share report') < visible.indexOf('<textarea'));
      assert(visible.indexOf('<textarea') < visible.indexOf(zh ? '送出</button>' : 'Send</button>'));
    } else assert(!visible.includes('<textarea'));
    assert.equal(JSON.stringify(states), before);
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
