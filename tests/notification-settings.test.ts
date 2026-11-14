import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import { evidencePreferencesSchema } from '../src/lib/evidence/schema';

test('Notifications directly expose editable preferences, retain basic access, and show retry only on failure', () => {
  for (const locale of ['en', 'zh-tw']) for (const enabled of [false, true]) for (const error of ['', 'HTTP 503 · preferences_read · trace-123\nOriginal failure']) {
    const preferences = evidencePreferencesSchema.parse({ acceptMessages: false, task: true, timeZone: 'Europe/Warsaw' });
    const data = { preferences: { weeklyEmail: false, watchEmail: true }, notifications: [{ id: 'message', kind: 'message', payload: {}, createdAt: '2026-11-14T12:00:00Z' }] };
    const states = [{ enabled }, '', data, error, { enabled }, '', data.preferences, '', '', false, null, preferences, '', '', false, false];
    const before = JSON.stringify(states); let index = 0;
    const load = pdfRuntime({ react: { ...React, useState: (value: unknown) => [index < states.length ? states[index++] : value, () => {}], useRef: (value: unknown) => ({ current: value }), useEffect() {}, useCallback: (fn: unknown) => fn },
      'next-intl': { useLocale: () => locale }, 'next/link': 'a', './ViewerOverview': { default: () => null }, '../matchmaking/CardView': { PrivatePhoto: () => null },
    });
    const Page = load<typeof import('../src/components/dashboard/network/NetworkPanels')>('src/components/dashboard/network/NetworkPanels.tsx').NotificationsPage;
    const html = renderToStaticMarkup(React.createElement(Page));
    assert(html.includes('id="notifications"')); assert(html.includes('id="notification-settings-title"'));
    assert(html.includes(locale === 'en' ? 'Accept messages and chat invitations' : '接受站內訊息與交流邀請'));
    assert(html.includes('Europe/Warsaw')); assert.equal((html.match(/type="checkbox"/g) || []).length, enabled ? 7 : 5);
    assert(!html.includes('/dashboard/account#notifications')); assert(!html.includes('>Reload</button>'));
    assert.equal(html.includes(locale === 'en' ? 'Mark all read' : '全部標為已讀'), enabled);
    assert.equal(html.includes(locale === 'en' ? '>Retry</button>' : '>重試</button>'), Boolean(error));
    if (error) { assert(html.includes(error)); assert(html.includes('role="alert"')); }
    assert.equal(JSON.stringify(states), before);
  }
});

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
    const html=renderToStaticMarkup(React.createElement(Preferences,{embedded:true}));assert.equal((html.match(/type="checkbox"/g)||[]).length,5);assert(html.includes('Europe/Warsaw'));assert(html.includes('<datalist'));assert(!html.includes('Share anonymous conversation counts'));
    assert(!evidencePreferencesSchema.safeParse({acceptMessages:'false'}).success);assert.equal(draft.connection,false);assert.equal(draft.task,true);
  }
});
