import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import { evidencePreferencesSchema } from '../src/lib/evidence/schema';

test('Notification bell uses localized inbox links, real unread labels and capped badges', () => {
  for(const locale of ['en','zh-tw']) for(const unread of [0,2,101]) {
    let index=0;
    const load=pdfRuntime({react:{...React,useState:(v:unknown)=>[index++===0?unread:v,()=>{}],useRef:()=>({current:null}),useEffect(){},useCallback:(fn:unknown)=>fn},'next/link':'a','next-intl':{useLocale:()=>locale}});
    const Bell=load<typeof import('../src/components/dashboard/NotificationBell')>('src/components/dashboard/NotificationBell.tsx').default;
    const html=renderToStaticMarkup(React.createElement(Bell));
    assert(html.includes(locale==='en'?'/dashboard/notifications':'/zh-tw/dashboard/notifications'));assert(html.includes('min-h-11'));assert(html.includes('aria-hidden="true"'));
    if(unread)assert(html.includes(locale==='en'?`${unread} unread`:`${unread} 則未讀`));
    if(unread>99)assert(html.includes('99+'));
  }
});
test('Short notification labels preserve separate receiving, email consent and time zone controls', () => {
  for(const locale of ['en','zh-tw']) {
    let index=0;const draft=evidencePreferencesSchema.parse({acceptMessages:false,task:true,timeZone:'Europe/Warsaw'});
    const load=pdfRuntime({react:{...React,useState:(v:unknown)=>[index++===1?draft:v,()=>{}],useEffect(){}},'next-intl':{useLocale:()=>locale}});
    const Preferences=load<typeof import('../src/components/dashboard/evidence/Preferences')>('src/components/dashboard/evidence/Preferences.tsx').default;
    const html=renderToStaticMarkup(React.createElement(Preferences,{embedded:true}));assert.equal((html.match(/type="checkbox"/g)||[]).length,6);assert(html.includes('Europe/Warsaw'));assert(html.includes(locale==='en'?'Advanced settings':'進階設定'));assert(!html.includes('<details open'));
    assert(!evidencePreferencesSchema.safeParse({acceptMessages:'false'}).success);assert.equal(draft.connection,false);assert.equal(draft.task,true);
  }
});
