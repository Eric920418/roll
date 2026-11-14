import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';
import { evidencePreferencesSchema } from '../src/lib/evidence/schema';

type Element = React.ReactElement<Record<string, unknown>>;
function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of React.Children.toArray(node)) if (React.isValidElement<Record<string, unknown>>(child)) {
    if (predicate(child)) return child;
    const result=find(child.props.children as React.ReactNode,predicate);if(result)return result;
  }
}
test('First setup uses device time zone; saved choices persist; invalid zones cannot save and hidden consent is retained', async () => {
  for(const locale of ['en','zh-tw']) for(const version of [0,2]) {
    const states: unknown[]=[],effects:(()=>unknown)[]=[],writes:Record<string,unknown>[]=[];let cursor=0;
    const preferences=evidencePreferencesSchema.parse({acceptMessages:false,benchmarkShare:true,timeZone:'Asia/Taipei'}),view={revision:1,state:{preferences,preferenceVersion:version}},original=JSON.stringify(view);
    const Format=function(language?:string,options?:Intl.DateTimeFormatOptions){return new Intl.DateTimeFormat(language,{timeZone:'Europe/Warsaw',...options});};
    const load=pdfRuntime({react:{...React,useId:()=> 'time-zone',useState:(initial:unknown)=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],(v:unknown)=>{states[i]=v;}];},useEffect:(effect:()=>unknown)=>{effects.push(effect);}},'next-intl':{useLocale:()=>locale},'@/lib/member-fetch':{MemberFetchError:class extends Error{},memberFetch:async(_url:string,init?:{body:string})=>{if(init)writes.push(JSON.parse(init.body));return view;}}},{crypto:globalThis.crypto,Intl:{DateTimeFormat:Format,supportedValuesOf:Intl.supportedValuesOf},setTimeout:(fn:()=>void)=>{fn();return 0;}});
    const Preferences=load<typeof import('../src/components/dashboard/evidence/Preferences')>('src/components/dashboard/evidence/Preferences.tsx').default;
    const render=()=>{cursor=0;return Preferences({embedded:true});};render();effects[0]();await new Promise(resolve=>setTimeout(resolve,0));
    let tree=render();const input=()=>find(render(),e=>e.type==='input'&&e.props.id==='time-zone')!;
    assert.equal(input().props.value,version===0?'Europe/Warsaw':'Asia/Taipei');assert.equal(input().props.list,'time-zone-options');
    const html=renderToStaticMarkup(tree);assert(!html.includes('type="checkbox" checked=""'));assert(!html.includes('Share anonymous conversation counts'));assert(html.includes('<datalist'));assert.equal(JSON.stringify(view),original);
    const save=()=>find(render(),e=>e.type==='button'&&e.props.children===(locale==='en'?'Save settings':'儲存設定'))!;
    (input().props.onChange as (e:{target:{value:string}})=>void)({target:{value:'Invalid/Zone'}});tree=render();assert(save().props.disabled);assert(renderToStaticMarkup(tree).includes('role="alert"'));
    (save().props.onClick as ()=>void)();await Promise.resolve();assert.equal(writes.length,0);
    const device=find(render(),e=>e.props['aria-label']===(locale==='en'?'Use device time zone':'使用本機時區'))!;(device.props.onClick as ()=>void)();
    assert.equal(input().props.value,'Europe/Warsaw');assert(!save().props.disabled);(save().props.onClick as ()=>void)();await new Promise(resolve=>setTimeout(resolve,0));
    const sent=writes[0].preferences as typeof preferences;assert.equal(sent.timeZone,'Europe/Warsaw');assert.equal(sent.benchmarkShare,true);assert.equal(sent.acceptMessages,false);assert.equal(JSON.stringify(view),original);
  }
});
