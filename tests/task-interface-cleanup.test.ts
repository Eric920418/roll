import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import { flowMilestones } from '../src/lib/action-plan/flow/catalog';
import type { FlowView } from '../src/lib/action-plan/flow/service';
import type { ActionPlanDto } from '../src/lib/action-plan/service';

const hooks = { ...React, useEffect() {}, useRef: () => ({ current: null }), useState: (v: unknown) => [v, () => {}] };
const localization = { usePlanDisplay: () => ({ planText: (v: string) => v }) };

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
