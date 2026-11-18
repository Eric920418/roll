import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';

test('Task templates show single-page work without mutating unconfirmed or completed records', () => {
  const load = pdfRuntime({ react: { ...React, useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}], useRef: () => ({ current: null }) } }, { crypto: globalThis.crypto });
  const Templates = load<typeof import('../src/components/dashboard/flow/Templates')>('src/components/dashboard/flow/Templates.tsx').default;
  const Results = load<typeof import('../src/components/dashboard/flow/TaskResults')>('src/components/dashboard/flow/TaskResults.tsx').default;
  const catalog = load<typeof import('../src/lib/action-plan/flow/catalog')>('src/lib/action-plan/flow/catalog.ts');
  const cases = [
    { step: '04-2', data: { kind: 'conversation', market: '', records: [{ ...catalog.emptyRecord('customer'), company: 'Saved company', reason: 'Saved reason' }] } },
    { step: '01-3', data: { kind: 'organize', values: {}, selections: [], confirmed: [], tiers: [], criteria: [1, 2].map(i => ({ id: String(i), label: 'Criterion ' + i, weight: 50, sources: [], confirmed: false })) } },
    { step: '02-1', data: { kind: 'outreach', market: '', contacts: [{ ...catalog.emptyContact('contact'), company: 'Saved company', offer: 'Reviewed offer', channel: 'Previously typed channel' }] } },
    { step: '03-3', data: { kind: 'document', sections: [0, 1, 2, 3].map(i => ({ id: String(i), body: 'Saved chapter ' + i, confirmed: false })) } },
    {step:'03-2',data:{kind:'organize',values:{},selections:['Email'],confirmed:[],tiers:[],criteria:[]}},
  ];
  const view = { steps: [], leads: [], criteria: [], tiers: [], channels: [{channel:'Email',total:20,reply:10,conversation:4,paid:1}], payments: [] };
  for (const locale of ['en', 'zh-tw']) for (const item of cases) {
    const original = JSON.stringify(item.data);
    const props = { ...item, locale, view, onChange: () => { throw new Error('Rendering must not change a draft'); } } as unknown as React.ComponentProps<typeof Templates>;
    const guided = renderToStaticMarkup(React.createElement(Templates, props));
    assert(!guided.includes('data-guided-fields'));
    assert.doesNotMatch(guided, /Switch to guided work|切換逐題整理/);
    if (item.step === '01-3') { assert(!guided.includes('Switch to guided work')); assert.equal((guided.match(/aria-label="Criterion name"|aria-label="條件名稱"/g) || []).length, 1); assert(guided.includes('Criterion 2')); }
    if (item.step === '03-2') {
      assert.doesNotMatch(guided, /<table/);
      assert.match(guided, /checked/);
      const results = renderToStaticMarkup(React.createElement(Results, { step: { id: item.step, data: item.data }, locale, view } as unknown as React.ComponentProps<typeof Results>));
      for (const value of ['50%', '20%', '5%']) assert(results.includes(value));
    }
    else assert(guided.includes('Saved') || guided.includes('Criterion'));
    assert.equal(JSON.stringify(item.data), original);
    const readOnly = renderToStaticMarkup(React.createElement(Templates, { ...props, disabled: true, readOnly: true }));
    assert(!readOnly.includes('data-guided-fields')); assert(!readOnly.includes('Switch to complete form'));
    if (item.step === '03-3') { assert.equal((guided.match(/<textarea/g)||[]).length,1); assert.equal((readOnly.match(/aria-pressed=/g)||[]).length,4); }
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
    const reference = renderToStaticMarkup(React.createElement(Editor, { row, locale, guided: false, reference: true, onChange() {} }));
    assert.doesNotMatch(reference, /<details|data-use-guided|其他資料與輸入工具/);
    assert(reference.includes('Original quote'));
    for (const guided of [false, true]) {
      const withMarket=renderToStaticMarkup(React.createElement(Editor,{row,locale,guided,marketField:React.createElement('input',{'aria-label':'Target market',defaultValue:'Original market'}),recordOptions:React.createElement('button',{type:'button'},'Remove draft record'),onChange:()=>{throw new Error('Rendering cannot write');}}));
      assert(withMarket.includes('Original market'));assert(withMarket.includes('Remove draft record'));assert.equal(JSON.stringify(row),original);
    }
  }
});
