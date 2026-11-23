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

test('Company-only editing submits the six necessary fields, preserves hidden data and shows full safe errors', async () => {
  for (const locale of ['en', 'zh-tw']) {
    const initial={companyName:'QA Company',industry:'saas',country:'TW',oneLinePitch:'QA product',companyStage:'MVP',primaryNeed:'paying-customers',website:'https://retained.invalid',companySize:'retained size',notes:'retained notes',needs:['retained need']};
    const original=JSON.stringify(initial),states:unknown[]=[]; let cursor=0, fail=false;
    const writes:Record<string,unknown>[]=[];
    const load=pdfRuntime({react:{...React,useState:(value:unknown)=>{const i=cursor++;if(!(i in states))states[i]=value;return[states[i],(v:unknown)=>{states[i]=v;}];},useRef:(value:unknown)=>({current:value}),useEffect(){}},'next-intl':{useLocale:()=>locale,useTranslations:()=>((key:string)=>key)},'next/navigation':{useRouter:()=>({refresh(){}})},'./DashboardUserProvider':{useDashboardUser:()=> 'qa-owner'},'./PlanRefresh':{notifyPlanChanged(){}}},{fetch:async(url:string,init:RequestInit)=>{assert.equal(url,'/api/account/profile');writes.push(JSON.parse(String(init.body)).data);return fail?Response.json({error:'Safe provider failure',code:'retry_later',requestId:'trace-company-qa'},{status:503}):Response.json({data:{saved:true}});}});
    const Form=load<typeof import('../src/components/dashboard/AccountProfileForm')>('src/components/dashboard/AccountProfileForm.tsx').default;
    const render=()=>{cursor=0;return Form({initial,companyOnly:true}) as React.ReactElement<{onSubmit:(event:React.FormEvent)=>Promise<void>;children:React.ReactNode}>;};
    await render().props.onSubmit({preventDefault(){}} as React.FormEvent);
    assert.deepEqual(Object.keys(writes[0]).sort(),['companyName','industry','country','oneLinePitch','companyStage','primaryNeed'].sort());
    assert.equal(JSON.stringify(initial),original);assert(!('notes' in writes[0]));assert(!('website' in writes[0]));
    fail=true;await render().props.onSubmit({preventDefault(){}} as React.FormEvent);
    const nodes=(node:React.ReactNode):React.ReactElement<Record<string,unknown>>[]=>React.Children.toArray(node).flatMap(child=>React.isValidElement(child)?[child as React.ReactElement<Record<string,unknown>>,...nodes((child.props as {children?:React.ReactNode}).children)]:[]);
    const error=nodes(render()).find(n=>n.props.role==='alert');assert(error);assert.match(String(error.props.children),/HTTP 503[\s\S]*Safe provider failure[\s\S]*retry_later[\s\S]*trace-company-qa/);
  }
});
