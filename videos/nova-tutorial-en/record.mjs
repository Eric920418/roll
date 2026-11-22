import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { origin, chrome, requireTool, raw, sleep, localDatabase } from './common.mjs';
import { database, day } from './fixtures.mjs';

const aria = name => `::-p-aria(${name})`;
export async function capture(session, mode) {
  localDatabase(session.databaseUrl);
  assert.equal(new URL(origin).hostname,'localhost');
  const { default: puppeteer }=requireTool('puppeteer-core');
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-gpu-compositing','--disable-partial-raster','--window-size=1920,1080']});
  const db=database(session.databaseUrl), checks=[];
  const context=await browser.createBrowserContext(), page=await context.newPage();
  await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  await page.setExtraHTTPHeaders({'x-forwarded-for':`192.0.2.${Math.floor(Math.random()*250)+1}`});
  page.setDefaultTimeout(12000);
  page.on('dialog',dialog=>dialog.accept());
  const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
  let fixture=null;
  await page.setRequestInterception(true);
  page.on('request',async request=>{
    try {
      const u=new URL(request.url());
      if(!['localhost','127.0.0.1'].includes(u.hostname)&&['POST','PUT','PATCH','DELETE'].includes(request.method())){errors.push('Blocked external write: '+request.url());await request.abort();return;}
      const response=await fixture?.(request,u);
      if(response){await request.respond({status:200,contentType:'application/json',body:JSON.stringify(response)});return;}
      await request.continue();
    }catch(error){errors.push(error.stack);if(!request.isInterceptResolutionHandled())await request.abort();}
  });
  let recorder, events=[], epoch=0, clicks=[], label='FICTIONAL LOCAL DEMO', currentActor='';
  const api=async(path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};},{path,method,body});
  const otherPages=new Map();
  async function other(key,path,method='GET',body) {
    let p=otherPages.get(key);
    if(!p){const c=await browser.createBrowserContext();p=await c.newPage();await p.setExtraHTTPHeaders({'x-forwarded-for':`192.0.2.${Math.floor(Math.random()*250)+1}`});await p.goto(origin+'/login');const r=await p.evaluate(async({email,password})=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});return r.status;},{email:session.users[key].email,password:session.password});assert.equal(r,200);otherPages.set(key,p);}
    return p.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};},{path,method,body});
  }
  async function login(key) {
    if(currentActor===key)return;
    const latest=JSON.parse(await readFile(join(raw,'session.json'),'utf8'));session.users[key].password=latest.users[key].password;
    await page.goto(origin+'/login',{waitUntil:'networkidle2'});
    const r=await api('/api/auth/login','POST',{email:session.users[key].email,password:session.users[key].password||session.password});assert.equal(r.status,200,'Demo login '+key);
    currentActor=key;
  }
  async function go(path) {await page.goto(origin+path,{waitUntil:'networkidle2'});await page.waitForFunction(()=>document.body.innerText.length>100&&!document.body.innerText.trim().endsWith('Loading…'));await sleep(900);await skipTour();}
  async function skipTour() {const skip=await page.$(aria('Skip tour'));if(skip&&await skip.isVisible()){await skip.click();await sleep(300);}}
  async function element(name,selector) {
    const find=({name,selector})=>{
      const visible=e=>e.getClientRects().length>0;
      if(selector)return [...document.querySelectorAll(selector)].find(visible);
      const explicit=[...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===name&&visible(e));
      if(explicit)return explicit;
      const text=[...document.querySelectorAll('button,a,summary,[role="tab"]')].find(e=>e.innerText.trim()===name&&visible(e));
      if(text)return text;
      return [...document.querySelectorAll('label')].find(e=>visible(e)&&[e.innerText.trim(),e.querySelector('span')?.innerText.trim(),e.firstChild?.textContent.trim()].includes(name))?.control;
    };
    await page.waitForFunction(find,{}, {name,selector});
    const handle=(await page.evaluateHandle(find,{name,selector})).asElement();
    assert.ok(handle,'Visible control '+name);await handle.scrollIntoView();await sleep(160);return handle;
  }
  async function click(name,selector) {
    const handle=await element(name,selector), box=await handle.boundingBox();assert.ok(box,name+' has a visible target');
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await page.mouse.move(x,y,{steps:12});await sleep(220);clicks.push({time:(performance.now()-epoch)/1000,x,y});
    await page.evaluate(({x,y})=>{const old=document.getElementById('tutorial-click');old?.remove();const el=document.createElement('div');el.id='tutorial-click';el.style.cssText=`position:fixed;left:${x-22}px;top:${y-22}px;width:44px;height:44px;border:3px solid #528cff;background:#528cff33;border-radius:50%;z-index:2147483646;pointer-events:none`;document.body.append(el);setTimeout(()=>el.remove(),650);},{x,y});
    await handle.asLocator().click();await sleep(300);
  }
  async function fill(name,value,selector) {
    const h=await element(name,selector);await click(name,selector);
    const type=await h.evaluate(e=>e.type);
    if(['date','datetime-local'].includes(type))await h.evaluate((e,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);
    else await h.asLocator().fill(value);
    assert.equal(await h.evaluate(e=>e.value),value,'Field filled: '+name);
  }
  async function select(name,value,selector) {const h=await element(name,selector);await focus(name,selector);await h.select(value);assert.equal(await h.evaluate(e=>e.value),value);}
  async function see(text) {await page.waitForFunction(text=>document.body.innerText.includes(text),{},text);}
  async function focus(name,selector) {const h=await element(name,selector), b=await h.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});return{x:b.x+b.width/2,y:b.y+b.height/2};}
  async function step(caption,action,options={}) {
    const start=(performance.now()-epoch)/1000;console.log('  '+caption.replaceAll('\n',' / '));
    const beforeUrl=page.url(),before=clicks.length,result=await action?.();
    let point=options.focus?await focus(options.focus,options.selector):(result?.x?result:null);
    if(!point&&clicks.length>before)point=clicks.at(-1);
    await sleep(options.settle??1200);const end=(performance.now()-epoch)/1000;
    events.push({caption,in:start,out:end,actor:currentActor,label,focus:point&&page.url()===beforeUrl?{x:point.x,y:point.y}:null,hold:options.hold||1,...(options.card?{card:options.card}:{})});
  }
  let active='',firstOffset=0;
  async function begin(id) {
    active=id;events=[];clicks=[];errors.length=0;
    if(id!=='mobile')await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
    const cursor=()=>{
      if(window.__novaCursorReady)return;window.__novaCursorReady=true;
      addEventListener('mousemove',e=>{let cursor=document.getElementById('tutorial-cursor');if(!cursor){cursor=document.createElement('div');cursor.id='tutorial-cursor';cursor.innerHTML='<svg width="34" height="42" viewBox="0 0 34 42"><path d="M3 2 L3 32 L11 25 L18 39 L25 35 L18 22 L30 21 Z" fill="white" stroke="#111" stroke-width="2.5"/></svg>';cursor.style.cssText='position:fixed;pointer-events:none;z-index:2147483647';document.documentElement.append(cursor);}cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});
    };
    await page.evaluateOnNewDocument(cursor);await page.evaluate(cursor);
    // Warm route compilation happens before the recorder starts.
    epoch=performance.now();const wall=Date.now()/1000;let first;
    // shortcut: the pinned Puppeteer CDP client supplies the encoder's first timestamp; recheck when upgrading HyperFrames.
    page._client().once('Page.screencastFrame',e=>{first=e.metadata.timestamp-wall;});
    recorder=await page.screencast({path:join(raw,id+'.webm'),format:'webm',fps:30,quality:20});
    await sleep(300);firstOffset=Number.isFinite(first)&&Math.abs(first)<2?first:0;
  }
  async function end() {
    await recorder.stop();
    for(const e of events){e.in=Math.max(0,e.in-firstOffset);e.out-=firstOffset;}
    for(const click of clicks)click.time-=firstOffset;
    assert.ok(events.length>0);for(const e of events){assert.ok(e.out>e.in);assert.ok(e.caption.split('\n').length<=2);}
    await writeFile(join(raw,active+'.json'),JSON.stringify({id:active,events,clicks,errors,checks},null,2));
    console.log('RECORDED '+active+' ('+events.length+' steps)');
  }
  const verified=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
  try {
    await mkdir(raw,{recursive:true});
    if(mode==='inspect') {
      await login(process.argv[3]||'member');await go(process.argv[4]||'/dashboard/agenda');
      console.log((await page.$eval('body',e=>e.innerText)).replace(/\nAfghanistan[\s\S]*?\nÅland Islands/g,'\n[Country list]').slice(0,18000));
      console.log('FIELDS',await page.$$eval('input,textarea,select',els=>els.map(e=>({tag:e.tagName,type:e.type,name:e.getAttribute('aria-label'),id:e.id,placeholder:e.getAttribute('placeholder'),value:e.value}))));
      await page.screenshot({path:join(raw,'inspect.png')});return;
    }
    const wanted=id=>mode==='all'||mode===id;
    if(wanted('intro')) {
      await login('member');await go('/dashboard');await begin('intro');
      await step('NOVA AI\nA practical client walkthrough',null,{card:'NOVA AI',hold:1.4});
      await step('Follow the cursor. Pause whenever you need more time.',()=>focus('Today’s priority','a[href="/dashboard/agenda"]'),{hold:1.2});
      await step('All accounts and business evidence in this video are fictional.',null,{card:'Local demonstration'});
      await step('Member access and certified mentor permissions differ.',null,{card:'Two roles · one workspace'});
      await step('AI and search examples are clearly labeled simulations.',null,{card:'External services · demo only'});await end();
    }
    if(wanted('profile')) {
      await db.user.update({where:{id:session.users.new.id},data:{completed:false,onboardingStep:2}});
      await page.goto(origin+'/login',{waitUntil:'networkidle2'});await begin('profile');currentActor='new';
      await step('Sign in with your registered email address.',()=>fill('Email',session.users.new.email));
      await step('Enter your password, then choose Log in.',async()=>{await fill('Password',session.password);await click('Log in');await page.waitForFunction(()=>location.pathname==='/onboarding/company');await sleep(1000);});
      await step('Complete your company name.',()=>fill('Company name','Northstar Studio'));
      await step('Select the industry that best matches your company.',()=>select('Industry','saas'));
      await step('Set your company size and home market.',async()=>{await select('Company size','1-10');await select('Home market / country','TW');});
      await step('Add your website if available, then continue.',async()=>{await fill('Company website (optional)','https://example.com');await click('Continue');await page.waitForFunction(()=>location.pathname==='/onboarding/requirements');});
      await step('Set your company age and seed-money range.',async()=>{await select('When was your company established?','lt1y');await select('Seed money','lt10k');});
      await step('Save these preferences to continue onboarding.',async()=>{await click('Finish & build my dashboard');await page.waitForFunction(()=>location.pathname==='/quiz');verified('Company preferences saved',(await db.user.findUnique({where:{id:session.users.new.id}})).onboardingStep===4);},{card:'Company preferences saved'});
      await step('Switching to a prepared member account for the next steps.',async()=>{await login('member');await go('/dashboard/profile');},{card:'Account switch · prepared member'});
      await step('Choose Edit details to update your company profile.',()=>click('Edit details'));
      await step('Keep your company name and pitch up to date.',()=>fill('Company name','Northstar Studio Demo'));
      await step('Save your changes before returning home.',async()=>{await click('Save changes');await sleep(1000);});
      await step('Reload to confirm your changes, then return Home.',async()=>{await go('/dashboard/profile');verified('Company edit persisted after reload',(await db.onboardingProfile.findUnique({where:{userId:session.users.member.id}})).companyName==='Northstar Studio Demo');await click('Home','a[href="/dashboard"]');});
      await end();
    }
    if(wanted('priority')) {
      const first=await db.actionItem.findFirst({where:{actionPlanId:session.users.member.planId,clientKey:'nova_v2_01-1'}});
      await db.actionItem.update({where:{id:first.id},data:{done:false,completedAt:null,taskWorkspace:{...first.taskWorkspace,data:{...first.taskWorkspace.data,records:first.taskWorkspace.data.records.filter(r=>/^person-[0-8]$/.test(r.id))}}}});
      await login('member');await go('/dashboard/agenda');await begin('priority');
      await step("Open Today's priority to find your current action.",()=>focus('', '#task-work'));
      await step('The roadmap contains five milestones and sixteen steps.',null,{card:'map'});
      await step('Later steps unlock after the required evidence is confirmed.',()=>focus('', '[data-today-priority]'));
      await step('This demo starts with nine preloaded conversations.',null,{card:'Preloaded progress · 9 conversations'});
      await step('Start a new customer conversation in the empty form.',()=>focus('Company'));
      await step('Identify the company and the person you spoke with.',async()=>{await fill('Company','Demo Operations 10');await fill('Person','Robin Tan');});
      await step('Record the date of the customer conversation.',()=>fill('Conversation date',day(0)));
      await step('Set the relationship and target-customer fit.',async()=>{await click('Prospect');await click('Fits');});
      await step('Describe the current workaround in the customer’s words.',()=>fill('Current solution','Spreadsheets assembled manually each Friday.'));
      await step('Record the pain without inventing customer evidence.',()=>fill('Main pain and customer wording','Our team loses three hours each week combining reports.'));
      await step('Choose the pain severity and actual willingness to pay.',async()=>{await click('High');await click('Willing');});
      await step('Save the step before leaving the page.',async()=>{await click('Save this step');await sleep(1500);});
      await step('Reload to verify that the conversation was saved.',async()=>{await go('/dashboard/agenda');const rows=await db.actionItem.findFirst({where:{actionPlanId:session.users.member.planId,clientKey:'nova_v2_01-1'}});verified('Conversation persisted after reload',rows.taskWorkspace.data.records.some(r=>r.company==='Demo Operations 10'));});
      await step('Confirm completion only when the evidence threshold is met.',async()=>{await click('Confirm and complete');await sleep(1500);verified('First step completed by the real API',(await db.actionItem.findFirst({where:{actionPlanId:session.users.member.planId,clientKey:'nova_v2_01-1'}})).done);});
      label='EXTERNAL AI · SIMULATED RESPONSE';
      await step('AI drafts are suggestions. This response is simulated.',()=>click('Speech, transcript and AI drafting'),{card:'AI service simulation'});
      await step('Paste notes you are authorized to use.',()=>fill('Paste meeting notes or a transcript','Small operations teams told us that manual weekly reporting takes too long. They currently combine spreadsheets.'));
      const flow=(await api('/api/action-plans/flow?locale=en')).data.data;
      const draft={...flow.steps.find(s=>s.id==='01-2').data,confirmed:[],values:{...flow.steps.find(s=>s.id==='01-2').data.values,positioning:'Help small operations teams reduce manual weekly reporting.'}};
      fixture=(request,u)=>u.pathname==='/api/action-plans/assist'&&request.method()==='POST'?{data:{result:{draft,variants:[draft.values.positioning],sources:[{quote:'Manual weekly reporting takes too long'}]},view:flow}}:null;
      await step('Generate an unconfirmed draft, then review its source quotes.',async()=>{await click('Generate unconfirmed draft');await see('Review source quotes');await click('Review source quotes');});
      await step('Apply only the draft you have checked against the evidence.',()=>click('Apply reviewed draft'));
      await step('Save explicitly. Applying a draft does not save your work.',async()=>{await click('Save this step');await sleep(1000);verified('Reviewed AI demonstration draft saved by real API',(await db.actionItem.findFirst({where:{actionPlanId:session.users.member.planId,clientKey:'nova_v2_01-2'}})).taskWorkspace.data.values.positioning===draft.values.positioning);});
      fixture=null;label='FICTIONAL LOCAL DEMO';
      await step('Each remaining step has its own evidence and unlock criteria.',()=>go('/dashboard/agenda'),{card:'Evidence first · then the next step'});
      await end();
    }
    if(wanted('prospects')) {
      await login('mentor');label='SEARCH STATES · SIMULATED / PRELOADED';
      let state='ready',posts=0;
      const order={id:'demo-search',submissionId:'demo-request',country:'TW',description:'Small operations teams needing weekly reporting',status:'running',createdAt:new Date().toISOString(),requested:5,delivered:0,usable:0,needsRecheck:false,companies:[]};
      const snapshot=()=>({data:{enabled:true,provider:'omrade',pricing:{version:1,searchFee:20},tokens:{available:500,reserved:state==='pending'?20:0},workspace:{revision:1,country:'TW',description:order.description,suggested:order.description},access:{canSearch:true,fullAccess:true},quota:{remaining:100},pending:state==='pending'?order:null,nextCursor:null,orders:state==='failed'?[{...order,status:'failed',error:'Demonstration: supplier did not deliver companies.'}]:state==='saved'?[{...order,status:'completed',delivered:1,usable:1,companies:[{id:'demo-company',name:'PRELOADED DEMO · Example Operations',quality:'strong',website:'https://example.com',contact:{kind:'page',value:'https://example.com/contact',source:'https://example.com/contact'},evidence:[]}]}]:[]}});
      fixture=(request,u)=>{if(u.pathname==='/api/prospects')return snapshot();if(u.pathname==='/api/prospects/orders'&&request.method()==='POST'){posts++;const body=JSON.parse(request.postData());order.submissionId=body.requestId;state='pending';return{data:{id:order.id}};}return null;};
      await go('/dashboard/agenda');await begin('prospects');
      await step('Open Find 5 companies from the current task.',()=>click('Find 5 companies'));
      await step('Choose the target country before describing the buyer.',()=>select('Target company country','TW'));
      await step('Describe the buyer and the problem you want to investigate.',()=>fill('Target buyer description',order.description));
      await step('Read the Token, refund and data-sharing rules first.',()=>click('Billing and refund rules'));
      await step('Confirm consent before submitting your targeting criteria.',()=>click('', 'dialog input[type="checkbox"]'));
      await step('Submit once. The pending order prevents duplicate requests.',async()=>{await click('Find 5 new companies');await sleep(1000);verified('Only one simulated search submission',posts===1);});
      await step('A pending order is still processing. Do not submit it again.',null,{card:'Simulated processing state'});
      await step('A failed delivery is not a successful search result.',async()=>{state='failed';await go('/dashboard/agenda');await click('Find 5 companies');},{card:'Simulated failure · no delivery'});
      await step('Review the failure and refund details before deciding to retry.',()=>focus('', 'dialog[open] article'));
      await step('This saved list is a preloaded example, not a live delivery.',async()=>{state='saved';await go('/dashboard/agenda');await click('Find 5 companies');},{card:'PRELOADED DEMO LIST'});
      await step('Check contact sources before preparing outreach.',()=>focus('', 'dialog[open] article'));
      await end();fixture=null;label='FICTIONAL LOCAL DEMO';
    }
    if(wanted('matching')) {
      await login('member');await go('/dashboard/matchmaking');await begin('matching');
      await step('Open Value Network to browse relevant members.',()=>focus('', 'h1'));
      await step('For you explains why a member may be relevant.',()=>click('For you'));
      await step('Use All members to explore beyond your recommendations.',()=>click('All members'));
      await step('Filter by founder, mentor, investor, partner or buyer.',async()=>{await click('Mentor');await sleep(500);});
      await step('Return to All to see every available role.',()=>click('All'));
      await step('Open Viewed you to review visitor information.',()=>click('Viewed you'));
      await step('Visitors appear according to their privacy preferences.',()=>focus('', 'h1'));
      await step('Choose Edit my card to control your public presentation.',()=>go('/dashboard/matchmaking/me/edit'));
      await step('Update your introduction with a specific description.',()=>fill('Your introduction','Founder building a weekly reporting tool for small operations teams.'));
      await step('Select the roles and details you want to show.',()=>focus('Public display name (optional)'));
      await step('Preview your card before saving it.',()=>click('Preview my card'));
      await step('Save the public card after checking the preview.',()=>click('Confirm changes to visible card'));
      await step('Reload to confirm your card changes were saved.',async()=>{await go('/dashboard/matchmaking/me/edit');verified('Public card introduction persisted',(await db.matchmakingProfile.findUnique({where:{userId:session.users.member.id}})).slogan.includes('Founder building'));});
      await step('Viewer identity is a separate privacy choice.',()=>focus('Make my viewer identity visible'));
      await end();
    }
    if(wanted('community')) {
      await db.roundtableRegistration.deleteMany({where:{roundtableId:session.upcomingId,userId:session.users.member.id}});
      await login('member');await go('/dashboard/matchmaking?tab=roundtables&roundtable='+session.upcomingId);await begin('community');
      await step('Browse Roundtables and check the topic, host and time.',()=>focus('', 'h1'));
      await step('Read the session purpose before requesting a seat.',()=>focus('Name for this session'));
      await step('Enter the name you want the group to see.',()=>fill('Name for this session','Alex Morgan'));
      await step('Write the question you want to discuss with the group.',()=>fill('Question and preparation for the group','How can I make customer interviews more useful for weekly reporting?'));
      await step('Review group-sharing consent before applying.',()=>click('Consent to group sharing'));
      await step('Apply to join. A request is not yet a confirmed seat.',async()=>{await click('', 'form:has(input[aria-label="Consent to group sharing"]) button');await sleep(1000);verified('Roundtable application stored',(await db.roundtableRegistration.findFirst({where:{roundtableId:session.upcomingId,userId:session.users.member.id}}))?.status==='pending');});
      await step('The demo host now approves this local application.',async()=>{const reg=await db.roundtableRegistration.findFirst({where:{roundtableId:session.upcomingId,userId:session.users.member.id}}),r=await db.roundtable.findUnique({where:{id:session.upcomingId}});const result=await other('mentor','/api/roundtables','POST',{action:'decide',id:r.id,revision:r.revision,registrationId:reg.id,decision:'approve',reason:'Demonstration host approval'});assert.equal(result.status,200,JSON.stringify(result));},{card:'Demo host approval · separate account'});
      await step('Reload and verify that your seat is confirmed.',async()=>{await go('/dashboard/matchmaking?tab=roundtables&roundtable='+session.upcomingId);verified('Roundtable seat confirmed',(await db.roundtableRegistration.findFirst({where:{roundtableId:session.upcomingId,userId:session.users.member.id}})).status==='confirmed');});
      await step('Submit the question you want feedback on before the session.',async()=>{await fill('Question for group feedback','What should I ask to test willingness to pay?');await click('Submit preparation');await see('Submitted');});
      await step('Use Messages to continue a conversation with a connection.',()=>go('/dashboard/messages?connection='+session.connectionId));
      await step('Write a clear message with a practical next step.',()=>fill('Message','Could we compare customer interview notes before the next roundtable?'));
      await step('Send the message, then verify the recipient can read it.',async()=>{await click('Send');await sleep(1000);const r=await other('peer',`/api/network/connections/${session.connectionId}/messages`);verified('Message visible to the real recipient',JSON.stringify(r.data).includes('Could we compare customer interview notes'));});
      await step('Post-session commitments return to Today’s priority.',()=>go('/dashboard/agenda'),{card:'After the host closes a session'});
      await end();
    }
    if(wanted('reports')) {
      await login('complete');await go('/dashboard/agenda');await begin('reports');
      await step('Switching to a prepared account with completed progress.',null,{card:'Account switch · completed demonstration'});
      await step('A validation report requires completed, valid evidence.',()=>focus('', '#flow-report'));
      await step('Open Preview / print to PDF to review the saved result.',async()=>{const h=await element('Preview / print to PDF');await h.evaluate(e=>e.target='_self');await click('Preview / print to PDF');await page.waitForFunction(()=>location.pathname.startsWith('/task-report/'));});
      await step('Read the report and check its version fingerprint.',()=>focus('', 'h1'));
      await step('Review the report chapters before exporting a copy.',async()=>{await page.evaluate(()=>scrollTo({top:650,behavior:'smooth'}));});
      await step('Choose Print, then Save as PDF in the system dialog.',async()=>{await page.emulateMediaType('print');await page.pdf({path:join(raw,'nova-demo-validation-report.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});await page.emulateMediaType('screen');verified('Real Chromium print-to-PDF generated',true);},{card:'Print → Save as PDF → Save'});
      await step('This is the real print result from the demonstration account.',null,{card:'pdf'});
      await step('Return to Today’s priority to manage report sharing.',()=>go('/dashboard/agenda'));
      await step('Create a sharing link only after reviewing the conditions.',async()=>{await click('Create report sharing link');await see('Dedicated link (copy to share)');});
      let sharedUrl='',anonymous;
      await step('Copy the dedicated link for read-only access.',async()=>{const h=await element('Dedicated link (copy to share)');sharedUrl=await h.evaluate(e=>e.value);assert.equal(new URL(sharedUrl).hostname,'localhost');anonymous=await browser.createBrowserContext();const p=await anonymous.newPage();await p.goto(sharedUrl,{waitUntil:'networkidle2'});verified('Anonymous report link opens',!(await p.$eval('body',e=>e.innerText)).includes('Document unavailable'));});
      await step('Revoke sharing when the report should no longer be public.',async()=>{await click('Revoke report sharing');await sleep(700);const p=await anonymous.newPage();await p.goto(sharedUrl,{waitUntil:'networkidle2'});verified('Revoked report link denies anonymous access',(await p.$eval('body',e=>e.innerText)).includes('Document unavailable'));await anonymous.close();});
      await step('Open Business plan to review the company overview and roadmap.',()=>go('/dashboard/business-plan'));
      await step('Check the five milestones and the current evidence stage.',()=>focus('', '[data-business-plan]'));
      await step('Company PDFs use the real print layout and current saved data.',async()=>{await page.pdf({path:join(raw,'nova-demo-business-plan.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});verified('Real company business-plan PDF generated',true);},{card:'Print → Save as PDF → Save'});
      await end();
    }
    if(wanted('rewards')) {
      await login('member');await go('/dashboard/rewards');await begin('rewards');
      await step('Open Rewards to review your available points.',()=>focus('', 'h1'));
      await step('Read How points work before expecting a reward.',()=>focus('', 'section:has(h2)'));
      await step('Reward actions have limits; repeated actions do not earn again.',()=>focus('Redeem · 100 pts'));
      await step('Choose Redeem to review the cost and credits.',()=>click('Redeem · 100 pts'));
      const before=(await db.rewardAccount.findUnique({where:{userId:session.users.member.id}})).balance;
      await step('Confirm redemption only after checking the exchange.',async()=>{await click('Confirm redemption');await see('5 POLARIS conversations added');verified('Real local reward redemption debited 100 points',(await db.rewardAccount.findUnique({where:{userId:session.users.member.id}})).balance===before-100);});
      await step('Check the updated points history and credit balance.',()=>go('/dashboard/rewards'));
      await step('Your invitation link identifies you as the inviter.',()=>focus('Your invitation link'));
      await step('Copy the link, then share it through your chosen channel.',()=>click('Copy link'));
      await step('Rewards require an eligible first purchase and waiting period.',()=>focus('Your referral code'),{card:'Eligibility first · rewards after verification'});
      await step('Refunds, monthly limits and payer rules can affect eligibility.',null,{card:'Read the current referral terms'});
      await end();
    }
    if(wanted('account')) {
      await login('member');await go('/dashboard/account');await begin('account');
      await step('Use Account and plan for company details and account controls.',()=>focus('', 'h1'));
      await step('Update your one-line pitch, then save the profile.',async()=>{await fill('One-line pitch','Weekly reporting software for small operations teams.');await click('Save changes');await sleep(800);});
      await step('Reload to verify that the updated details were saved.',async()=>{await go('/dashboard/account');verified('Account details saved after reload',(await db.onboardingProfile.findUnique({where:{userId:session.users.member.id}})).oneLinePitch==='Weekly reporting software for small operations teams.');});
      await step('Review your current plan, trial access and remaining allowance.',()=>focus('', '#plan'));
      await step('Expand Usage details to understand how credits are counted.',()=>click('Usage details'));
      await step('Review prices and billing periods before choosing a plan.',()=>focus('', '[data-testid="subscribe-business"]'));
      await step('Payment continues outside NOVA. Stop before confirming a purchase.',null,{card:'Payment boundary · no purchase in this demo'});
      await step('Open Notification settings to control email preferences.',()=>click('Notification settings'));
      await step('Choose the alerts you want, then save your preferences.',async()=>{await click('Visitor summary');await click('Save preferences');await see('Preferences saved');});
      await step('Viewer identity is separate from your public business card.',async()=>{await go('/dashboard/account');await click('Make my viewer identity visible');await sleep(600);await go('/dashboard/account');verified('Viewer identity preference survives reload',await (await element('Make my viewer identity visible')).evaluate(e=>e.checked));});
      const newPassword=session.password+'-updated';
      await step('Enter your current password before choosing a new one.',async()=>{await fill('Current password',session.users.member.password||session.password);await fill('New password',newPassword);});
      await step('Update the password and use the new password next time.',async()=>{await click('Update password');await sleep(700);const r=await api('/api/auth/login','POST',{email:session.users.member.email,password:newPassword});verified('Updated password authenticates',r.status===200);session.users.member.password=newPassword;await writeFile(join(raw,'session.json'),JSON.stringify(session,null,2),{mode:0o600});});
      await end();
    }
    if(wanted('mobile')) {
      await login('member');await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await go('/dashboard');await begin('mobile');
      await step('On mobile, open Menu to reveal the navigation.',()=>click('Menu'));
      await step('Choose Today’s priority from the same navigation.',()=>click("Today's priority",'a[href="/dashboard/agenda"]'));
      await step('The current task uses the same evidence and save rules.',()=>focus('', '[data-today-priority]'));
      await step('Open Menu again to reach Value Network.',async()=>{await click('Menu');await click('Value Network','a[href="/dashboard/matchmaking"]');});
      await step('Swipe or scroll the tabs to reach Roundtables and Messages.',()=>focus('Roundtables'));
      await step('Start with today’s task. Save evidence. Follow up with people.',()=>go('/dashboard'),{card:'Your daily path · task → evidence → follow-up'});
      await step('NOVA AI\nLet evidence guide your next decision.',null,{card:'NOVA AI',hold:1.5});await end();
    }
    if(wanted('mentor')) {
      for(const previous of await db.roundtable.findMany({where:{hostId:session.users.mentor.id,status:'scheduled',topic:'Demo · Weekly reporting customer clinic'}})){const r=await other('mentor','/api/roundtables','POST',{action:'cancel',id:previous.id,revision:previous.revision,reason:'Retiring a prior local tutorial recording fixture.'});assert.equal(r.status,200,JSON.stringify(r));}
      if((await db.roundtable.findUnique({where:{id:session.pastId}})).status!=='scheduled'){
        const past=await db.roundtable.create({data:{hostId:session.users.mentor.id,topic:'Previous evidence clinic · PRELOADED DEMO',description:'Preloaded past session for attendance and commitment recording.',steps:['01-1'],industry:'all',languages:['en'],startsAt:new Date(Date.now()-2*86400000),endsAt:new Date(Date.now()-2*86400000+3600000),timezone:'Asia/Taipei',capacity:6,registrationMode:'approval',meetingUrl:'https://example.com/tutorial-meeting',requestId:randomUUID(),requestHash:randomUUID()}});
        const reg=await db.roundtableRegistration.create({data:{roundtableId:past.id,userId:session.users.member.id,name:'Alex Morgan',question:'How can I improve customer interviews?',status:'confirmed',approvedAt:new Date(),consentAt:new Date()}});
        session.pastId=past.id;session.pastRegistrationId=reg.id;
      }
      await db.matchmakingProfile.update({where:{userId:session.users.peer.id},data:{roles:['founder','partner']}});
      await db.mentorCertification.deleteMany({where:{userId:session.users.member.id}});
      await login('member');await go('/dashboard/matchmaking?tab=roundtables');await begin('mentor');
      await step('Hosting requires NOVA mentor certification.',()=>click('Apply to become a NOVA mentor'));
      await step('Provide the public name for your mentor profile.',()=>fill('Public mentor name','Alex Morgan · Demo applicant'));
      await step('Add evidence URLs that support your expertise.',()=>fill('Evidence URLs','https://example.com/demo-mentor-evidence'));
      await step('Describe your expertise and relevant experience.',async()=>{await fill('Expertise','Customer interviews, reporting workflows and product validation.');await fill('Professional bio','Fictional mentor applicant used only to demonstrate the certification application.');});
      await step('Confirm certification consent, then submit your application.',async()=>{await click('Consent to certification use');await click('Submit mentor application');await see('Mentor application awaiting NOVA review');verified('Mentor application awaits review',(await db.mentorCertification.findUnique({where:{userId:session.users.member.id}})).status==='pending');});
      await step('Approval is reviewed separately; it is not automatic.',null,{card:'Pending review · no hosting permission yet'});
      await step('Switching to a pre-approved demonstration mentor account.',async()=>{await login('mentor');await go('/dashboard/matchmaking?tab=roundtables');},{card:'Account switch · certified mentor'});
      await step('Start a new session with a specific topic.',()=>fill('Session topic','Demo · Weekly reporting customer clinic'));
      await step('Tell participants what to prepare for the session.',()=>fill('Purpose and preparation','Bring one recent customer conversation and one question about willingness to pay.'));
      await step('Choose the relevant evidence stages, industry and language.',()=>focus('Industry'));
      await step('Set the start time in your browser’s time zone.',()=>fill('Start time (your browser time zone)',day(-7)+'T15:00'));
      await step('Check duration, capacity and the registration mode.',()=>select('Registration mode','approval'));
      await step('Add a meeting URL for confirmed participants.',()=>fill('Meeting URL','https://example.com/demo-new-meeting'));
      await step('Create the session, then check its saved details.',async()=>{const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/roundtables'&&r.request().method()==='POST'&&JSON.parse(r.request().postData()||'{}').action==='create');pending.catch(()=>{});await click('Create roundtable');const response=await pending;assert.equal(response.status(),200,await response.text());const result=await response.json();session.createdSessionId=result.data.selectedId;const r=await db.roundtable.findUnique({where:{id:session.createdSessionId}});verified('Mentor created the new session returned by the real API',r?.topic==='Demo · Weekly reporting customer clinic');await writeFile(join(raw,'session.json'),JSON.stringify(session,null,2),{mode:0o600});});
      await step('A separate demo member now requests a seat.',async()=>{const r=await other('peer','/api/roundtables','POST',{action:'apply',id:session.createdSessionId,name:'Jordan Lee',question:'How should I organize reporting pain points?',consent:true});assert.equal(r.status,200,JSON.stringify(r));await go('/dashboard/matchmaking?tab=roundtables&roundtable='+session.createdSessionId);},{card:'Demo application · separate member'});
      await step('Review the application and record your decision reason.',()=>fill('Decision reason','Relevant customer evidence question; accepted for the demo.'));
      await step('Approve the request and verify the confirmed seat.',async()=>{await click('Approve application');await sleep(1200);verified('Host approval confirmed peer seat',(await db.roundtableRegistration.findFirst({where:{roundtableId:session.createdSessionId,userId:session.users.peer.id}})).status==='confirmed');});
      await step('Update the meeting link if the session URL changes.',()=>click('Update meeting link'));
      await step('Save the new URL and confirm it after reloading.',async()=>{await fill('New meeting URL','https://example.com/demo-updated-meeting');await click('Save meeting URL');await sleep(700);await go('/dashboard/matchmaking?tab=roundtables&roundtable='+session.createdSessionId);verified('Updated meeting link persisted',(await db.roundtable.findUnique({where:{id:session.createdSessionId}})).meetingUrl.endsWith('demo-updated-meeting'));});
      await step('Switching to a preloaded session that has already ended.',()=>go('/dashboard/matchmaking?tab=roundtables&roundtable='+session.pastId),{card:'Session switch · past demonstration'});
      await step('Open Attendance and commitments after the session ends.',()=>click('Attendance and commitments'));
      await step('Record actual attendance before adding a commitment.',()=>select('Attendance','attended'));
      await step('Write the specific action the attendee agreed to take.',()=>fill('Committed action','Interview two operations managers'));
      await step('Define a measurable completion criterion and deadline.',async()=>{await fill('Measurable completion criteria','Save two customer conversation records with actual wording.');await fill('Commitment deadline',day(-5));});
      await step('Finish the session to add the commitment to the attendee’s tasks.',async()=>{await click("Finish and add commitments to today's tasks");await sleep(1000);verified('Past session closed by host API',(await db.roundtable.findUnique({where:{id:session.pastId}})).status==='completed');});
      await step('If a future session cannot proceed, cancel with a clear reason.',async()=>{await go('/dashboard/matchmaking?tab=roundtables&roundtable='+session.createdSessionId);await click('Cancel session and retain history');});
      await step('Confirm cancellation. Registrations and the reason stay in history.',async()=>{await fill('Cancellation reason','Demonstration session cancelled; no real meeting will take place.');await click('Confirm cancellation');await sleep(1000);verified('Future demo session cancelled',(await db.roundtable.findUnique({where:{id:session.createdSessionId}})).status==='cancelled');});
      await step('Switch back to the attendee to verify the added task.',async()=>{await login('member');await go('/dashboard/agenda#roundtable-commitments');await see('Interview two operations managers');const reg=await db.roundtableRegistration.findUnique({where:{id:session.pastRegistrationId}});verified('Post-session commitment visible in member tasks',Boolean(reg.calendarItemId)&&reg.attendance==='attended');},{card:'Account switch · attendee'});
      await end();
    }
  } catch(error) {
    console.error(error);console.error('Browser state',browser.connected,page.isClosed(),browser.process()?.exitCode);
    await page.screenshot({path:join(raw,(active||mode)+'-failure.png')}).catch(()=>{});
    await writeFile(join(raw,(active||mode)+'-failure.txt'),page.url()+'\n'+await page.$eval('body',e=>e.innerText).catch(()=>'(Browser closed)')+'\n'+error.stack);
    if(recorder)await recorder.stop().catch(()=>{});
    throw error;
  } finally {await db.$disconnect();await browser.close();}
}
