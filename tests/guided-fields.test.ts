import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';

test('Guided fields navigate nested groups, retain field values and recover after removing a question', () => {
  let selected: string | null = null;
  const load = pdfRuntime({ react: { ...React, useState: () => [selected, (value: string) => { selected = value; }], useRef: () => ({ current: null }) } }, { requestAnimationFrame: (fn: () => void) => fn() });
  const Guided = load<typeof import('../src/components/dashboard/flow/GuidedFields')>('src/components/dashboard/flow/GuidedFields.tsx').default;
  const field = (name: string) => React.createElement('input', { key: name, 'aria-label': name, defaultValue: name + ' saved' });
  const children = [React.createElement(React.Fragment, { key: 'a' }, field('one')), React.createElement(React.Fragment, { key: 'b' }, field('two')), field('three')];
  const render = (nodes: React.ReactNode = children, guided = true) => Guided({ children: nodes, guided, locale: 'en' }) as React.ReactElement<{ children: React.ReactNode[] }>;
  let tree = render(); let nodes = tree.props.children;
  assert.match(renderToStaticMarkup(tree), /Guided work 1 \/ 3/);
  const questions = nodes[1] as React.ReactElement<{ hidden: boolean }>[];
  assert.equal(new Set(questions.map(q => q.key)).size, 3);
  assert.deepEqual(Array.from(questions, q => q.props.hidden), [false, true, true]);
  const controls = nodes[2] as React.ReactElement<{ children: React.ReactElement<{ onClick(): void; disabled: boolean }>[] }>;
  controls.props.children[1].props.onClick();
  tree = render(); nodes = tree.props.children;
  assert.deepEqual(Array.from(nodes[1] as typeof questions, q => q.props.hidden), [true, false, true]);
  assert.match(renderToStaticMarkup(tree), /two saved/);
  tree = render([children[0], children[2]]);
  assert.deepEqual(Array.from(tree.props.children[1] as typeof questions, q => q.props.hidden), [false, true]);
  const full = renderToStaticMarkup(render(children, false));
  assert(!full.includes('hidden')); assert(!full.includes('Guided work'));
  assert(full.includes('one saved') && full.includes('two saved') && full.includes('three saved'));
});

test('Task templates show single-page work without mutating unconfirmed or completed records', () => {
  const load = pdfRuntime({ react: { ...React, useState: (initial: unknown) => [initial, () => {}], useRef: () => ({ current: null }) } });
  const Templates = load<typeof import('../src/components/dashboard/flow/Templates')>('src/components/dashboard/flow/Templates.tsx').default;
  const catalog = load<typeof import('../src/lib/action-plan/flow/catalog')>('src/lib/action-plan/flow/catalog.ts');
  const cases = [
    { step: '04-2', data: { kind: 'conversation', market: '', records: [{ ...catalog.emptyRecord('customer'), company: 'Saved company', reason: 'Saved reason' }] } },
    { step: '01-3', data: { kind: 'organize', values: {}, selections: [], confirmed: [], tiers: [], criteria: [1, 2].map(i => ({ id: String(i), label: 'Criterion ' + i, weight: 50, sources: [], confirmed: false })) } },
    { step: '02-1', data: { kind: 'outreach', market: '', contacts: [{ ...catalog.emptyContact('contact'), company: 'Saved company', offer: 'Reviewed offer', channel: 'Previously typed channel' }] } },
    { step: '03-3', data: { kind: 'document', sections: [0, 1, 2, 3].map(i => ({ id: String(i), body: 'Saved chapter ' + i, confirmed: false })) } },
  ];
  const view = { steps: [], leads: [], criteria: [], tiers: [], channels: [], payments: [] };
  for (const locale of ['en', 'zh-tw']) for (const item of cases) {
    const original = JSON.stringify(item.data);
    const props = { ...item, locale, view, onChange: () => { throw new Error('Rendering must not change a draft'); } } as unknown as React.ComponentProps<typeof Templates>;
    const guided = renderToStaticMarkup(React.createElement(Templates, props));
    assert(!guided.includes('data-guided-fields'));
    if (item.data.kind !== 'conversation') assert(guided.includes(locale === 'en' ? 'Switch to guided work' : '切換逐題整理'));
    assert(guided.includes('Saved') || guided.includes('Criterion'));
    assert.equal(JSON.stringify(item.data), original);
    const readOnly = renderToStaticMarkup(React.createElement(Templates, { ...props, disabled: true, readOnly: true }));
    assert(!readOnly.includes('data-guided-fields')); assert(!readOnly.includes('Switch to complete form'));
    if (item.step === '02-1') assert(guided.includes('Previously typed channel'));
  }
});


test('Flat conversation forms expose required inputs and retain all saved values in both languages', () => {
  for(const locale of ['en','zh-tw']) {
    const load=pdfRuntime({'next-intl':{useLocale:()=>locale}});
    const Editor=load<typeof import('../src/components/dashboard/flow/ConversationEditor')>('src/components/dashboard/flow/ConversationEditor.tsx').default;
    const catalog=load<typeof import('../src/lib/action-plan/flow/catalog')>('src/lib/action-plan/flow/catalog.ts');
    const row={...catalog.emptyRecord('saved'),company:'Original company',name:'Original person',pain:'Original quote',solution:'Original solution',date:'2026-11-09',severity:'high' as const,relationship:'prospect',fit:'yes' as const,wtp:'considering' as const};
    const original=JSON.stringify(row);
    const html=renderToStaticMarkup(React.createElement(Editor,{row,locale,guided:false,onChange:()=>{throw new Error('Rendering cannot write');}}));
    for(const value of ['Original company','Original person','Original quote','Original solution','2026-11-09']) assert(html.includes(value));
    assert(html.includes('data-conversation-form'));assert.equal((html.match(/aria-pressed="true"/g)||[]).length,4);
    assert(!html.includes('hidden'));assert.equal(JSON.stringify(row),original);
    for (const guided of [false, true]) {
      const withMarket=renderToStaticMarkup(React.createElement(Editor,{row,locale,guided,marketField:React.createElement('input',{'aria-label':'Target market',defaultValue:'Original market'}),recordOptions:React.createElement('button',{type:'button'},'Remove draft record'),onChange:()=>{throw new Error('Rendering cannot write');}}));
      assert(withMarket.includes('Original market'));assert(withMarket.includes('Remove draft record'));assert.equal(JSON.stringify(row),original);
    }
  }
});
