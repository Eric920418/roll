import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pdfRuntime } from './helpers/pdf-runtime';

test('Missing profile fields add only the chosen value, retain failed drafts and cancel without writes in both languages', async () => {
  for (const locale of ['en', 'zh-tw']) {
    const states: unknown[] = [], refs: { current: unknown }[] = []; let cursor=0, refCursor=0, fail=true, refreshes=0;
    const writes: {url:string;init:{body:string}}[]=[];
    const load=pdfRuntime({react:{...React,useState:(initial:unknown)=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],(v:unknown)=>{states[i]=v;}];},useRef:(initial:unknown)=>{const i=refCursor++;return refs[i] ||= {current:initial};},useEffect(){}},'next-intl':{useLocale:()=>locale,useTranslations:()=>((key:string)=>key)},'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})},'./DashboardUserProvider':{useDashboardUser:()=> 'owner'},'./PlanRefresh':{notifyPlanChanged(){}},'@/lib/member-fetch':{memberFetch:async(url:string,init:{body:string})=>{writes.push({url,init});if(fail)throw Error('HTTP 503\nSafe error\nretry_later\ntrace-123');return{saved:true};}}},{requestAnimationFrame:(fn:()=>void)=>fn()});
    const Field=load<typeof import('../src/components/dashboard/MissingProfileField')>('src/components/dashboard/MissingProfileField.tsx').default;
    const render=()=>{cursor=0;refCursor=0;return Field({field:'companyStage',label:'Company stage',options:[{value:'MVP',label:locale==='en'?'MVP':'最小可行產品'}]}) as React.ReactElement<Record<string,unknown>>;};
    let tree=render();assert.match(renderToStaticMarkup(tree),locale==='en'?/Add \+/:/新增＋/);assert(!renderToStaticMarkup(tree).includes('Not provided'));
    (tree.props.onClick as ()=>void)();tree=render();
    const fieldset=Array.isArray(tree.props.children) ? tree.props.children[0] as React.ReactElement<{children:React.ReactElement[]}> : null;assert(fieldset);
    const select=(fieldset.props.children[0] as React.ReactElement<{children:React.ReactNode[]}>).props.children[1] as React.ReactElement<{onChange:(event:{target:{value:string}})=>void}>;
    select.props.onChange({target:{value:'MVP'}});tree=render();
    await (tree.props.onSubmit as (event:{preventDefault():void})=>Promise<void>)({preventDefault(){}});
    assert.match(renderToStaticMarkup(render()),/HTTP 503/);assert.match(renderToStaticMarkup(render()),/trace-123/);assert.match(renderToStaticMarkup(render()),/value="MVP" selected/);
    assert.deepEqual(JSON.parse(writes[0].init.body),{data:{companyStage:'MVP'}});assert.equal(writes[0].url,'/api/account/profile');assert.equal(refreshes,0);
    tree=render();const fs=(tree.props.children as React.ReactElement<{children:React.ReactElement<{children:React.ReactElement<{onClick():void}>[]}>[]}>[])[0];const buttons=fs.props.children[1].props.children;
    buttons[1].props.onClick();assert.match(renderToStaticMarkup(render()),locale==='en'?/Add \+/:/新增＋/);assert.equal(writes.length,1);
    tree=render();(tree.props.onClick as ()=>void)();tree=render();assert.match(renderToStaticMarkup(tree),/value="MVP" selected/);
    fail=false;await (tree.props.onSubmit as (event:{preventDefault():void})=>Promise<void>)({preventDefault(){}});assert.match(renderToStaticMarkup(render()),/role="status"/);assert.equal(refreshes,1);assert.equal(writes.length,2);
  }
});
