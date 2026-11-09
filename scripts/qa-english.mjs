import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
assert(connectionString, 'Set ROLL_REWARDS_TEST_DATABASE_URL to an isolated QA database.');
const database = new URL(connectionString);
assert(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) && database.pathname.startsWith('/roll_rewards_qa'), 'English QA only accepts an isolated loopback roll_rewards_qa database.');
const scenario = process.argv[2] || 'start';
const mode = scenario === 'dev' ? 'dev' : 'start';
assert(['start', 'dev', 'flow', 'roundtables', 'tokens', 'pdf', 'commerce', 'coupons', 'homepage', 'guided', 'legacy', 'language', 'localization', 'layout'].includes(scenario), 'Use pnpm test:english [start|dev|flow|roundtables].');
const require = createRequire(import.meta.url);
const { default: { chromium } } = await import(pathToFileURL(require.resolve('playwright')).href);
const output = process.env.NOVA_QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'nova-english-'));
fs.mkdirSync(output, { recursive: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
// Next treats a rewrite to a different host as an external request; use one host for both sides.
const hostname = 'localhost', port = 3116, origin = `http://${hostname}:${port}`;
const report = { mode, scenario, checks: [], screenshots: [], browserErrors: [], cleanup: null };
const users = {}, created = [], contexts = [], newsletterEmails=[];
const password = randomBytes(24).toString('base64url'), authSecret = randomBytes(32).toString('hex');
const suffix = randomUUID(), testIp = `192.0.2.${1 + randomBytes(1)[0] % 253}`;
let server, browser, commerceOwned = false, couponCodesOwned = false;
const serverLog = fs.createWriteStream(path.join(output, 'server.log'));
const check = (name, value) => { assert(value, name); report.checks.push(name); console.log(`PASS ${name}`); };

let copyProvider, copyProviderUrl, copyCalls=0, copyFailure=false;
async function startCopyProvider() {
  copyProvider=createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;
    copyCalls++;res.setHeader('Content-Type','application/json');
    if(copyFailure){res.statusCode=503;res.end(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'Controlled provider outage'}}));return;}
    try {
      const input=JSON.parse(raw),english=input.system.includes('natural English'),rows=JSON.parse(input.messages[0].content);
      const translations=rows.map(({id,text})=>{
        let result;
        if(text.startsWith('Compare '))result=text.replace('Compare ','比較 ').replace(' proposals by ',' 份提案，期限 ').replace(' for ','，金額 ');
        else if(text.startsWith('比較 '))result=text.replace('比較 ','Compare ').replace(' 份提案，期限 ',' proposals by ').replace('，金額 ',' for ');
        else result=(english?'Review saved evidence ':'依已儲存的佐證確認 ')+(text.match(/__NOVA_KEEP_\d+__/g)||[]).join(' ');
        return{id,text:result};
      });
      res.end(JSON.stringify({id:'qa-copy',type:'message',role:'assistant',model:input.model,content:[{type:'tool_use',id:'qa-tool',name:'translated_copy',input:{translations}}],stop_reason:'tool_use',usage:{input_tokens:1,output_tokens:1}}));
    }catch{res.statusCode=400;res.end(JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'Malformed QA request'}}));}
  });
  await new Promise(resolve=>copyProvider.listen(0,'127.0.0.1',resolve));copyProviderUrl='http://127.0.0.1:'+copyProvider.address().port;
}
async function localizationQA() {
  for(const [key,locale] of [['desktop','zh-tw'],['mobile','en']]) {
    const owner=users[key],zh=locale==='zh-tw',prefix=zh?'/zh-tw':'',title=zh?'Compare 7 proposals by 2027-02-20 for USD 260':'比較 7 份提案，期限 2027-02-20，金額 USD 260',expected=zh?'比較 7 份提案，期限 2027-02-20，金額 USD 260':'Compare 7 proposals by 2027-02-20 for USD 260';
    await db.actionPlan.update({where:{id:owner.planId},data:{goal:'Make 1M'}});await db.actionItem.update({where:{id:owner.actionId},data:{title,source:'nova'}});await db.planMilestone.update({where:{id:owner.milestoneId},data:{title}});
    const original=async()=>JSON.stringify({plan:await db.actionPlan.findUnique({where:{id:owner.planId}}),actions:await db.actionItem.findMany({where:{actionPlanId:owner.planId},orderBy:{id:'asc'}}),milestones:await db.planMilestone.findMany({where:{actionPlanId:owner.planId},orderBy:{id:'asc'}})}),snapshot=await original();
    const {context,page}=await session(key,1440);
    const foreign=await context.request.get(origin+'/api/action-plans/localization?'+new URLSearchParams({planId:users.blocked.planId,locale}));check('Translation rejects another member '+locale,foreign.status()===404);
    const arbitrary=await context.request.post(origin+'/api/action-plans/localization',{headers:{origin},data:{planId:owner.planId,locale,text:'Not accepted'}});check('Translation rejects arbitrary client text '+locale,arbitrary.status()===400);
    copyFailure=true;await page.goto(origin+prefix+'/dashboard');await page.getByRole('button',{name:zh?'重試翻譯':'Retry translation',exact:true}).waitFor();
    const alert=page.getByRole('alert').filter({hasText:zh?'翻譯尚未完成':'Translation is incomplete'});check('Safe translation error retains source and HTTP trace '+locale,(await alert.innerText()).includes('HTTP 503')&&(await alert.innerText()).includes('internal')&&(await page.locator('#home-task-title').innerText())===title);
    copyFailure=false;await page.getByRole('button',{name:zh?'重試翻譯':'Retry translation',exact:true}).click();await page.waitForFunction(t=>document.querySelector('#home-task-title')?.textContent===t,expected);
    check('Unknown system copy translated end to end '+locale,true);const calls=copyCalls;
    for(const width of [390,768,1440]) {
      await page.setViewportSize({width,height:1000});await page.reload();await page.waitForFunction(t=>document.querySelector('#home-task-title')?.textContent===t,expected);
      check('Translated home responsive '+locale+width,await page.evaluate(l=>document.documentElement.lang===l&&document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1,locale));await screenshot(page,'copy-home-'+locale+width);
      await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('[data-legacy-task]').waitFor();await closeTour(page,locale);await page.waitForFunction(t=>document.querySelector('[data-legacy-task] [data-today-priority]')?.textContent.includes(t),expected);
      check('Translated task and map use same copy '+locale+width,(await page.locator('#action-map > summary').innerText()).includes(expected));
      check('Translated tasks responsive '+locale+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'copy-task-'+locale+width);
      await page.goto(origin+prefix+'/dashboard');
    }
    check('Cached translations do not call provider again '+locale,copyCalls===calls);check('Plan and completion data unchanged '+locale,await original()===snapshot);check('No member AI or Token debit '+locale,await db.aiUsage.count({where:{userId:owner.id}})===0&&await db.tokenReservation.count({where:{userId:owner.id}})===0);
    await context.close();
  }
  const anonymous=await browser.newContext();contexts.push(anonymous);check('Anonymous translation API protected',(await anonymous.request.get(origin+'/api/action-plans/localization?planId=x&locale=en')).status()===401);await anonymous.close();
}

async function startServer() {
  await new Promise((resolve, reject) => {
    let startup = '';
    const timer = setTimeout(() => reject(new Error('QA server startup timed out.')), 60000);
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, '--hostname', hostname, '--port', String(port)], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: connectionString, ROLL_LOCAL_POSTGRES: 'true', AUTH_SECRET: authSecret, NEXT_PUBLIC_APP_URL: origin, MEMBER_NETWORK_ENABLED: 'true', MEMBER_NETWORK_EMAIL_ENABLED: 'false', ANTHROPIC_API_KEY: 'qa-disabled', ANTHROPIC_BASE_URL: copyProviderUrl || 'http://127.0.0.1:1', RESEND_API_KEY: '', OMRADE_API_KEY: ['tokens','commerce'].includes(scenario) ? 'qa-disabled' : '', OMRADE_ENABLED: ['tokens','commerce'].includes(scenario) ? 'true' : 'false', OMRADE_WORKER_ENABLED: ['tokens','commerce'].includes(scenario) ? 'true' : 'false', PAYPAL_CLIENT_SECRET: '', INVESTOR_BLOB_READ_WRITE_TOKEN: '', ...(scenario === 'coupons' ? { BILLING_NOVA60_ENABLED: 'true', ...Object.fromEntries(['PRO','BUSINESS'].flatMap(p=>['MONTHLY','YEARLY'].map(i=>[`PAYPAL_PLAN_ID_NOVA60_${p}_${i}_USD`,`P-QA${p}${i}`]))) } : {}) },
    });
    server.stdout.on('data', chunk => { serverLog.write(chunk); startup += chunk; if (startup.includes('Ready in')) { clearTimeout(timer); resolve(); } });
    server.stderr.on('data', chunk => serverLog.write(chunk));
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`QA server exited during startup (${code}). See server.log.`)); });
  });
}

// Observe failures immediately so a failed click still reaches fixture cleanup.
function waitResponse(page, predicate) {
  const pending = page.waitForResponse(predicate);
  pending.catch(() => {});
  return pending;
}

async function redirects() {
  for (const prefix of ['', '/zh-tw']) {
    const response = await fetch(`${origin}${prefix}/login`, { redirect: 'manual' });
    check(`${prefix || 'English'} login does not redirect to itself`, response.status === 200 && !response.headers.has('location'));
    await response.body.cancel();
  }
  const legacy = await fetch(`${origin}/en/login?from=qa`, { redirect: 'manual' });
  check('Legacy /en login keeps query and redirects once', legacy.status === 307 && new URL(legacy.headers.get('location'), origin).pathname === '/login' && legacy.headers.get('location').includes('from=qa'));
  await legacy.body.cancel();
  const protectedPage = await fetch(`${origin}/dashboard`, { redirect: 'manual' });
  check('Unauthenticated dashboard remains protected', protectedPage.status === 307 && new URL(protectedPage.headers.get('location'), origin).pathname === '/login');
  await protectedPage.body.cancel();
}

async function fixtures() {
  const passwordHash = await bcrypt.hash(password, 10), start = new Date(Date.now() - 86400000), end = new Date(Date.now() + 30 * 86400000);
  const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const deadline = new Date(today.getTime() + 90 * 86400000), milestoneDate = new Date(today.getTime() + 25 * 86400000);
  for (const key of ['mobile', 'desktop', 'blocked', 'outcome', 'complete', 'newpaid', 'trial', 'expired', 'investor', 'requester']) {
    const trial = ['trial', 'expired'].includes(key);
    const row = await db.user.create({ data: {
      email: `nova-en-${key}-${suffix}@example.invalid`, passwordHash, firstName: 'QA', lastName: key, completed: true, onboardingStep: 4, quizCompleted: true,
      plan: trial ? 'free' : 'business', subscriptionStatus: trial ? null : 'ACTIVE', paypalSubscriptionId: trial ? null : `I-QA-${key}-${suffix}`, currentPeriodEnd: trial ? null : end,
      ...(trial ? { trialPolicy: 'interviews-3-v1', trialPlan: 'pro', trialStartsAt: start, trialEndsAt: key === 'expired' ? new Date(Date.now() - 3600000) : end } : {}),
      profile: { create: { companyName: `QA ${key}`, industry: 'saas', country: 'TW', oneLinePitch: 'Evidence-based customer development', companyStage: 'Validation', primaryNeed: 'paying-customers', targetMarkets: ['TW'], needs: [] } },
      matchmakingProfile: { create: { displayName: `QA ${key}`, role: key === 'investor' ? 'investor' : 'founder', verified: key === 'investor', categories: ['collaboration'], country: 'TW', industry: 'saas', slogan: 'Validate real customer demand', offers: 'Customer development experience', looksFor: 'Founders and partners', visibleFields: ['country', 'industry', 'companyPitch', 'offers', 'looksFor'], visible: true, sourcePolicy: 2, optedInAt: start, lastActiveAt: start } },
    } });
    created.push({ id: row.id, email: row.email }); users[key] = row;
    if (['mobile', 'desktop', 'blocked', 'outcome', 'complete', 'expired'].includes(key)) {
      const plan = await db.actionPlan.create({ data: { userId: row.id, activeKey: row.id, locale: 'en', companyStage: 'Validation', stageReason: 'Based on saved customer evidence', stageConfidence: 65, bottleneckGroup: 'Sales', bottleneckCode: 'no_icp', bottleneckReason: 'Confirm who needs the solution most', bottleneckConfidence: 70, requestId: randomUUID(), goal: 'Win the first paying customer within 90 days', goalStartsAt: today, goalDeadline: deadline, goalAssumptions: [] } });
      const milestone = await db.planMilestone.create({ data: { actionPlanId: plan.id, position: 0, title: 'Confirm your target customer', expectedOutcome: 'Identify the strongest customer need', acceptanceCriteria: 'Confirm positioning with real customer feedback', targetDate: milestoneDate, achievedAt: key === 'complete' ? start : null } });
      for (let i = 0; i < 3; i++) {
        const done = ['outcome', 'complete'].includes(key);
        const item = await db.actionItem.create({ data: { actionPlanId: plan.id, clientKey: `task_${i}`, title: ['Write a positioning statement', 'Build a lead scorecard', 'Tier your customer leads'][i], milestoneId: milestone.id, impact: 'High', urgencyType: 'scheduled', urgencyDays: 7, dependencyLevel: i > 0 || key === 'blocked' ? 1 : 0, difficulty: 2, actionTimeMinHours: 1, actionTimeMaxHours: 2, companyStage: 'Validation', stageFit: 5, stageFitReason: 'Validate with customer evidence', bottleneckGroup: 'Sales', bottleneckCode: 'no_icp', bottleneckFit: 5, bottleneckFitReason: 'Identify priority customers', outcomeCategory: 'customers', expectedOutcome: 'Complete a positioning statement and record feedback from three potential customers', outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7, executionOrder: i, done, completedAt: done ? start : null } });
        if (i === 0) Object.assign(users[key], { actionId: item.id, planId: plan.id, milestoneId: milestone.id });
        else await db.actionDependency.create({ data: { actionId: item.id, dependsOnId: users[key].actionId } });
      }
    }
  }
  for (const key of ['mobile', 'desktop']) {
    const connection = await db.networkConnection.create({ data: { pairKey: [users[key].id, users.investor.id].sort().join(':'), senderId: users.investor.id, recipientId: users[key].id, status: 'accepted', acceptedAt: start, messages: { create: { senderId: users.investor.id, requestId: randomUUID(), body: 'Let us discuss your customer evidence.' } } } });
    const invitation = await db.networkConnection.create({ data: { pairKey: [users[key].id, users.requester.id].sort().join(':'), senderId: users.requester.id, recipientId: users[key].id, status: 'pending' } });
    Object.assign(users[key], { connectionId: connection.id, invitationId: invitation.id });
  }
}

async function session(key, width, ui = false) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, extraHTTPHeaders: { 'x-forwarded-for': testIp } });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  if (ui) {
    await page.goto(`${origin}/login`);
    await page.getByLabel('Email', { exact: true }).fill(users[key].email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL(`${origin}/dashboard`);
    check(`Real English login form ${width}px`, true);
  } else {
    const response = await context.request.post(`${origin}/api/auth/login`, { headers: { origin }, data: { email: users[key].email, password } });
    assert.equal(response.status(), 200, `QA login ${key}`);
  }
  return { context, page };
}

async function layout(page, name, locale = 'en') {
  await page.locator('h1').waitFor();
  const value = await page.evaluate(() => ({ headings: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > innerWidth + 1, language: document.documentElement.lang }));
  check(`${name}: one H1, correct locale, no horizontal overflow`, value.headings === 1 && !value.overflow && value.language === locale);
}
async function screenshot(page, name) {
  const file = path.join(output, `${mode}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file);
}
async function closeTour(page, locale='en') {
  const skip = page.getByRole('button', { name: locale==='zh-tw'?'略過導覽':'Skip tour', exact: true });
  try { await skip.waitFor({ state: 'visible', timeout: 3000 }); await skip.click(); await skip.waitFor({ state: 'hidden' }); }
  catch (error) { if (await skip.isVisible()) throw error; }
}
async function saveResponse(page, action) {
  const response = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(`/actions/${action}`));
  await page.getByRole('button', { name: 'Save statement', exact: true }).click();
  return (await response).status();
}

async function core(key, width) {
  const { context, page } = await session(key, width, true);
  await page.locator('#home-task-title').waitFor();
  await layout(page, `Home ${width}`);
  await page.getByText('Checking member access…', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByText('Loading recommendations…', { exact: true }).waitFor({ state: 'hidden' });
  check(`Home has at most three real recommendations ${width}`, await page.locator('section[aria-labelledby="home-members-title"] article').count() === 3);
  await screenshot(page, `home-${width}`);
  await page.getByRole('link', { name: "Continue today's task", exact: false }).click();
  await page.locator('#action-map').waitFor(); await closeTour(page);
  await layout(page, `Task ${width}`);
  check(`Action map defaults collapsed ${width}`, !await page.locator('#action-map').evaluate(e => e.open));
  check(`English map uses actual singular milestone ${width}`, (await page.locator('#action-map > summary').innerText()).includes('View all 1 milestone'));
  const complete = page.getByRole('checkbox', { name: 'Complete task: Write a positioning statement', exact: true });
  check(`Unfinished task is locked ${width}`, await complete.isDisabled());
  const inputs = [['Who you help (your target customer)', 'B2B startup founders'], ['Their pain', 'Unclear customer demand'], ['The outcome they get', 'Evidence for the next step'], ['How you deliver it', 'Customer conversations'], ['Their reaction (what made sense, what confused them)', 'Three founders confirmed the statement']];
  for (const [label, value] of inputs) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Tested with (number of prospects)', { exact: true }).fill('3');
  await db.actionPlan.update({ where: { id: users[key].planId }, data: { revision: { increment: 1 } } });
  check(`Stale task save returns 409 ${width}`, await saveResponse(page, users[key].actionId) === 409);
  check(`Conflict preserves draft ${width}`, await page.getByLabel(inputs[0][0], { exact: true }).inputValue() === inputs[0][1]);
  await page.getByRole('button', { name: 'Compare latest version and retry', exact: true }).click();
  check(`Conflict retry saves ${width}`, await saveResponse(page, users[key].actionId) === 200);
  await page.waitForFunction(() => !document.querySelector('input[aria-label="Complete task: Write a positioning statement"]').disabled);
  check(`Valid saved task unlocks ${width}`, await complete.isEnabled());
  await screenshot(page, `task-${width}`);
  await page.route('**/api/action-plans/actions/*', route => route.request().method() === 'POST' ? route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'QA analysis unavailable; your saved records are retained.', code: 'qa_analysis_unavailable', requestId: 'qa-safe-trace' }) }) : route.continue());
  const completed = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(`/actions/${users[key].actionId}`));
  await complete.click(); check(`Task completes through real API ${width}`, (await completed).status() === 200);
  await page.getByText('QA analysis unavailable; your saved records are retained.', { exact: false }).first().waitFor();
  check(`Analysis error has HTTP/code/trace ${width}`, (await page.getByRole('alert').allInnerTexts()).some(t => t.includes('502') && t.includes('qa_analysis_unavailable') && t.includes('qa-safe-trace')));
  await page.goto(`${origin}/dashboard/matchmaking?tab=all`);
  await page.getByText("Advanced filters and search", { exact: true }).click(); await page.getByRole('search').waitFor(); await layout(page, `Members ${width}`);
  check(`Four English tabs ${width}`, await page.getByRole('tab').count() === 4);
  await page.getByRole('button', { name: 'Investor', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search public company cards' }).fill('QA investor');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('#matchmaking-panel-all article').filter({ hasText: 'QA investor' }).waitFor();
  check(`Role and text filters ${width}`, await page.locator('#matchmaking-panel-all article').count() === 1);
  await page.getByRole('tab', { name: 'Roundtables', exact: true }).click();
  await page.getByText('No sessions match. Check your records or adjust the filters.', { exact: true }).waitFor();
  check(`Roundtables shows real availability ${width}`, await page.getByText('No sessions match. Check your records or adjust the filters.', { exact: true }).isVisible());
  await screenshot(page, `matchmaking-${width}`);
  await page.goto(`${origin}/dashboard/messages?connection=${users[key].connectionId}`);
  await page.waitForURL(/tab=messages/); await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  check(`Legacy English message link keeps connection ${width}`, new URL(page.url()).searchParams.get('connection') === users[key].connectionId);
  await layout(page, `Inbox ${width}`);
  await page.getByRole('tab', { name: /^Messages/ }).getByLabel('1 unread messages', { exact: true }).waitFor();
  check(`Unread badge matches saved message ${width}`, true);
  const read = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(`/connections/${users[key].connectionId}`));
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  check(`Mark read uses real API ${width}`, (await read).status() === 200);
  await page.getByRole('tab', { name: /^Messages/ }).getByLabel('1 unread messages', { exact: true }).waitFor({ state: 'hidden' });
  check(`Mark read clears badge ${width}`, true);
  const draft = `Unsent draft ${width}`;
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(draft);
  let messagePolls = 0;
  page.on('request', request => { if (request.url().includes(`/connections/${users[key].connectionId}/messages`) && request.method() === 'GET') messagePolls++; });
  await page.getByRole('tab', { name: 'Roundtables', exact: true }).click();
  await page.waitForTimeout(300); const before = messagePolls;
  await page.waitForTimeout(15500);
  check(`Hidden inbox stops polling ${width}`, messagePolls === before);
  await page.getByRole('tab', { name: /^Messages/ }).click();
  check(`Tab switch preserves draft ${width}`, await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue() === draft);
  const messageUrl = `**/api/network/connections/${users[key].connectionId}/messages`;
  await page.route(messageUrl, route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA message not sent', code: 'qa_send_failed', requestId: 'qa-send-trace' }) }) : route.continue());
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('QA message not sent', { exact: false }).waitFor();
  check(`Failed send keeps draft and error ${width}`, await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue() === draft && (await page.getByRole('alert').allInnerTexts()).some(t => t.includes('503') && t.includes('qa-send-trace')));
  await page.unroute(messageUrl);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('log').getByText(draft, { exact: true }).waitFor();
  check(`Message retry sends exactly once ${width}`, await db.networkMessage.count({ where: { connectionId: users[key].connectionId, body: draft } }) === 1);
  await screenshot(page, `messages-${width}`);
  await page.getByRole('checkbox', { name: 'Company profile', exact: true }).check();
  const shareUrl = `/connections/${users[key].connectionId}/sharing`;
  let shared = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(shareUrl));
  await page.getByRole('button', { name: 'Confirm sharing consent', exact: true }).click();
  check(`Explicit private sharing saves ${width}`, (await shared).status() === 200);
  await page.getByRole('button', { name: 'Revoke all my sharing with this member', exact: true }).waitFor();
  check(`Only consented section is shared ${width}`, (await db.networkShare.findFirst({ where: { connectionId: users[key].connectionId, ownerId: users[key].id } })).sections.join() === 'profile');
  shared = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(shareUrl));
  await page.getByRole('button', { name: 'Revoke all my sharing with this member', exact: true }).click();
  check(`Private sharing revokes ${width}`, (await shared).status() === 200);
  await page.getByRole('button', { name: 'Revoke all my sharing with this member', exact: true }).waitFor({ state: 'hidden' });
  await page.goto(`${origin}/dashboard/matchmaking?tab=messages&connection=${users[key].invitationId}`);
  const reply = width === 390 ? 'accept' : 'decline';
  const invitation = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(`/connections/${users[key].invitationId}`));
  await page.getByRole('button', { name: reply, exact: true }).click();
  check(`Invitation ${reply} ${width}`, (await invitation).status() === 200 && (await db.networkConnection.findUnique({ where: { id: users[key].invitationId } })).status === (reply === 'accept' ? 'accepted' : 'declined'));
  await page.getByRole('button', { name: reply, exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /^QA investor ·/ }).click();
  const blocked = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(`/connections/${users[key].connectionId}`));
  await page.getByRole('button', { name: 'Block and stop private sharing', exact: true }).click();
  check(`Blocking stops new messages ${width}`, (await blocked).status() === 200);
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor({ state: 'hidden' });
  await page.goto(`${origin}/dashboard/matchmaking?tab=sharing&connection=${users[key].connectionId}`); await page.waitForURL(/tab=messages/);
  check(`Legacy sharing keeps connection ${width}`, new URL(page.url()).searchParams.get('connection') === users[key].connectionId);
  await page.goto(`${origin}/dashboard/matchmaking?tab=members`); await page.waitForURL(/tab=recommendations/);
  await page.goto(`${origin}/dashboard/matchmaking?tab=prospects`); await page.waitForURL(/dashboard\/agenda#prospects/);
  check(`Legacy member and prospect routes ${width}`, true);
  await context.close();
}

async function tablet() {
  const { context, page } = await session('desktop', 768);
  for (const route of ['/dashboard', '/dashboard/agenda', ...['recommendations', 'all', 'roundtables', 'messages'].map(tab => `/dashboard/matchmaking?tab=${tab}`)]) {
    await page.goto(`${origin}${route}`); await closeTour(page);
    await layout(page, `Tablet ${route}`);
  }
  const selected = page.getByRole('tab', { name: /^Messages/ });
  await selected.focus(); await selected.press('Home');
  const first = page.getByRole('tab', { name: 'For you', exact: true });
  check('Keyboard Home selects and focuses first tab', await first.getAttribute('aria-selected') === 'true' && await first.evaluate(e => e === document.activeElement));
  await first.press('ArrowRight');
  const all = page.getByRole('tab', { name: 'All members', exact: true });
  check('Keyboard arrow selects and focuses next tab', await all.getAttribute('aria-selected') === 'true' && await all.evaluate(e => e === document.activeElement));
  check('Tabs meet 44px target height', await page.getByRole('tab').evaluateAll(tabs => tabs.every(e => e.getBoundingClientRect().height >= 44)));
  check('Tablet Roundtables label stays on one line', await page.getByRole('tab', { name: 'Roundtables', exact: true }).evaluate(e => { const range = document.createRange(); range.selectNodeContents(e.firstChild); return range.getClientRects().length === 1; }));
  await page.locator('#matchmaking-panel-all').getByText('Advanced filters and search',{exact:true}).click();
  await page.getByRole('search').waitFor();
  await screenshot(page, 'matchmaking-768'); await context.close();
}

async function states() {
  const expected = { blocked: 'Review prerequisites', outcome: "Confirm this stage's outcomes", complete: 'Review your results', newpaid: 'Answer five questions', trial: 'Answer five questions', expired: 'View plans & trial status' };
  for (const [key, label] of Object.entries(expected)) {
    const { context, page } = await session(key, 390);
    await page.goto(`${origin}/dashboard`);
    await page.locator('#home-task-title').waitFor();
    check(`English home state ${key}`, await page.locator('section[aria-labelledby="home-task-title"]').getByRole('link', { name: label, exact: false }).isVisible());
    if (key === 'expired') check('Expired account cannot see paid task', !(await page.locator('#home-task-title').innerText()).includes('Write a positioning'));
    if (['blocked', 'complete', 'expired', 'outcome'].includes(key)) {
      await page.locator('section[aria-labelledby="home-task-title"]').getByRole('link').click();
      const target = key === 'expired' ? '/dashboard/account#plan' : key === 'outcome' ? '/dashboard/agenda#current-outcome' : '/dashboard/agenda#action-map';
      await page.waitForURL(`${origin}${target}`); await closeTour(page);
      check(`Home primary link reaches ${key} destination`, true);
      if (['blocked', 'complete'].includes(key)) {
        await page.waitForFunction(() => document.querySelector('#action-map')?.open);
        check(`Map deep link opens for ${key}`, true);
      }
    }
    if (['trial', 'newpaid'].includes(key)) {
      await page.locator('section[aria-labelledby="home-task-title"]').getByRole('link').click();
      await page.locator('dialog[open] input[type=radio]').first().waitFor({ state: 'attached' });
      check(`Five-question setup ${key}`, await page.locator('dialog[open] fieldset').count() === 5);
      for (const fieldset of await page.locator('dialog[open] fieldset').all()) await fieldset.locator('label').first().click();
      check(`Five choices retained ${key}`, await page.locator('dialog[open] input[type=radio]:checked').count() === 5);
    }
    if (key === 'outcome') {
      await page.getByRole('textbox', { name: 'Actual result', exact: true }).fill('Customer evidence was reviewed and confirmed.');
      await page.getByRole('button', { name: 'Confirm outcome achieved', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#action-map')?.open);
      check('Milestone completion opens map', true);
      await page.reload(); await page.locator('#action-map').waitFor();
      check('Milestone expansion is shown once', !await page.locator('#action-map').evaluate(e => e.open));
    }
    await layout(page, `State ${key}`); await context.close();
  }
}

async function openInputOptions(page, locale) {
  const label=locale==='zh-tw'?'更多輸入方式':'More input options';const summary=page.getByText(label,{exact:true});
  await summary.waitFor({state:'visible'});if(!await summary.evaluate(e=>e.parentElement.open))await summary.click();
}
async function openTaskTools(page) {
  const tools=page.locator('#task-tools');await tools.waitFor({state:'visible'});if(!await tools.evaluate(e=>e.open))await tools.locator(':scope > summary').click();
}
async function languageQA() {
  const {context,page}=await session('desktop',1440),owner=users.desktop;
  const title='Run paid pilot offer with 3 prospects to test willingness to pay',criterion='At least 1 of 3 prospects agrees to a paid pilot, confirming a validated willingness-to-pay price point.',milestone='Validate ICP through structured customer discovery';
  await db.actionPlan.update({where:{id:owner.planId},data:{goal:'Make 1M'}});await db.planMilestone.update({where:{id:owner.milestoneId},data:{title:milestone,expectedOutcome:milestone,acceptanceCriteria:criterion}});await db.actionItem.update({where:{id:owner.actionId},data:{title,expectedOutcome:criterion,metricTarget:1,metricCurrent:0,metricUnit:'companies'}});
  const snapshot=async()=>JSON.stringify({plan:await db.actionPlan.findUnique({where:{id:owner.planId}}),milestones:await db.planMilestone.findMany({where:{actionPlanId:owner.planId},orderBy:{position:'asc'}}),actions:await db.actionItem.findMany({where:{actionPlanId:owner.planId},orderBy:{id:'asc'}})}),original=await snapshot();
  const writes=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/action-plans/')&&!r.url().includes('/localization')&&!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  for(const locale of ['zh-tw','en']) {
    const zh=locale==='zh-tw',prefix=zh?'/zh-tw':'',expectedTitle=zh?'向 3 位潛在客戶提出付費試用，驗證付費意願':title,expectedCriterion=zh?'在 3 位潛在客戶中，至少 1 位同意付費試用，確認對方接受的試用價格。':criterion,expectedMilestone=zh?'透過結構化客戶訪談，驗證目標客戶輪廓':milestone;
    await page.goto(origin+prefix+'/dashboard');await page.locator('#home-task-title').waitFor();check('Localized home task '+locale,await page.locator('#home-task-title').innerText()===expectedTitle);check('Localized home criterion '+locale,(await page.locator('section[aria-labelledby="home-task-title"]').innerText()).includes(expectedCriterion));check('Home preserves the original member goal '+locale,(await page.locator('section[aria-labelledby="home-task-title"]').innerText()).includes('Make 1M'));
    for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Language home responsive '+locale+width,await page.evaluate(l=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.lang===l,locale));await screenshot(page,'language-home-'+locale+'-'+width);}
    await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('[data-legacy-task]').waitFor();await closeTour(page,locale);const hero=page.locator('[data-legacy-task] [data-today-priority]');check('Localized task title and criteria '+locale,(await hero.innerText()).includes(expectedTitle)&&(await hero.innerText()).includes(expectedCriterion));check('Localized task keeps quantities '+locale,(await hero.innerText()).includes('0 / 1'));
    const map=page.locator('#action-map');check('Localized roadmap summary '+locale,(await map.locator(':scope > summary').innerText()).includes(expectedMilestone));await map.locator(':scope > summary').click();check('Localized roadmap keeps original criteria '+locale,(await map.innerText()).includes(expectedCriterion));
    if(zh){await map.getByText('搜尋與篩選',{exact:true}).click();await map.getByRole('textbox',{name:'搜尋任務',exact:true}).fill('評分卡');check('Chinese roadmap search finds translated task',await map.getByRole('heading',{name:'建立潛在客戶評分卡',exact:true}).count()===1);await map.getByRole('textbox',{name:'搜尋任務',exact:true}).fill('');}
    await map.locator(':scope > summary').click();
    for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Language task responsive '+locale+width,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'language-task-'+locale+'-'+width);}
    check('Locale switch never rewrites original plan '+locale,await snapshot()===original);
  }
  check('Translation never submits a plan mutation',writes.length===0);check('Translation consumes no AI or Token reservation',await db.aiUsage.count({where:{userId:owner.id}})===0&&await db.tokenReservation.count({where:{userId:owner.id}})===0);
  await context.close();
}

async function legacyLayoutQA() {
  for(const [key,locale] of [['mobile','zh-tw'],['desktop','en']]) {
    const zh=locale==='zh-tw',w=(a,b)=>zh?a:b,prefix=zh?'/zh-tw':'';
    const {context,page}=await session(key,1440), owner=users[key], actionId=owner.actionId;
    const saved=await db.actionItem.findMany({where:{actionPlanId:owner.planId},orderBy:{executionOrder:'asc'}});
    const pastDate=new Date(Date.now()-86400000),criteria=[{id:'legacy-condition',criterion:'Actual buyer need',weight:3,fit:'Confirms manual reporting'}];
    await db.actionDependency.deleteMany({where:{actionId:{in:saved.slice(1).map(a=>a.id)}}});
    await db.actionItem.update({where:{id:saved[1].id},data:{title:'Interview 2 founders',done:true,completedAt:pastDate,executionOrder:0,dependencyLevel:0,recordingMode:'interview',metricTarget:2,metricCurrent:2,metricUnit:'companies'}});
    await db.actionItem.update({where:{id:saved[2].id},data:{title:'Build a lead scorecard',done:true,completedAt:pastDate,executionOrder:1,taskWorkspace:{kind:'scorecard',criteria},taskFinding:{result:{cards:[0,1,2].map(i=>({title:'Original finding '+i,text:'Saved insight '+i,evidence:'Manual reporting is slow'})),why:'Original saved next step'},source:'user'}}});
    await db.actionDependency.create({data:{actionId:saved[2].id,dependsOnId:saved[1].id}});
    await db.actionItem.update({where:{id:actionId},data:{executionOrder:2}});
    const leads=[];
    for(let i=0;i<2;i++)leads.push(await db.meetingNote.create({data:{userId:owner.id,title:'Owned legacy conversation '+i,insight:{actionId:saved[1].id,stage:'discover',type:'Prospect',name:'Existing person '+i,company:'Legacy QA company '+i,fit:'yes',role:'Buyer',answers:['Manual reporting is slow','','',''],notes:'Original interview quote',region:'TW',industry:'saas',date:pastDate.toISOString().slice(0,10)}}}));
    const historical=async()=>JSON.stringify({actions:await db.actionItem.findMany({where:{id:{in:saved.slice(1).map(a=>a.id)}},orderBy:{id:'asc'}}),notes:await db.meetingNote.findMany({where:{userId:owner.id},orderBy:{id:'asc'}})});
    const originalHistory=await historical();
    const snapshot=async()=>JSON.stringify({plan:await db.actionPlan.findUnique({where:{id:owner.planId}}),actions:await db.actionItem.findMany({where:{actionPlanId:owner.planId},orderBy:{id:'asc'}}),history:await historical()});
    const positioning={kind:'positioning',who:'Original customer',pain:'Original customer pain',outcome:'Original result',how:'Original method',tested:3,reaction:'Actual saved customer feedback'};
    const cases=[
      ['icp','Define and document your ideal customer profile',{kind:'icp',candidates:[{name:'Original candidate',industry:'SaaS',size:'10 people',role:'Founder',pain:'Manual reporting',trigger:'New market'}]},false],
      ['interview','Interview 2 founders',null,false],
      ['pilot','Run paid pilot offer with 3 prospects',{kind:'pilot',prospects:leads.map(l=>({leadId:l.id,offer:'Original offer',response:'thinking',reason:'Original objection'}))},true],
      ['positioning','Write a positioning statement',positioning,false],
      ['scorecard','Build a lead scorecard',{kind:'scorecard',criteria},false],
      ['tiers','Tier your customer leads',{kind:'tiers',leads:leads.map(l=>({leadId:l.id,tier:'A',segment:'Existing segment',matches:['legacy-condition']}))},false],
      ['generic','Prepare the original market brief',null,false],
      ['commercial','Secure 2 paying customers',null,true],
    ];
    for(const [kind,title,workspace,commercial] of cases) {
      await db.actionItem.update({where:{id:actionId},data:{title,taskWorkspace:workspace||Prisma.DbNull,recordingMode:kind==='interview'?'interview':null,metricTarget:kind==='interview'?2:4,metricCurrent:kind==='interview'?0:2,metricUnit:kind==='interview'?'companies':'records'}});
      const before=await snapshot();await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('[data-legacy-task]').waitFor();await closeTour(page,locale);
      const article=page.locator('[data-legacy-task]'),localizedTitle=zh?({icp:'定義並記錄目標客戶輪廓',interview:'訪談 2 位創辦人',pilot:'向 3 位潛在客戶提出付費試用，驗證付費意願',positioning:'撰寫一句話定位',scorecard:'建立潛在客戶評分卡',tiers:'將潛在客戶分級',generic:title,commercial:'取得 2 位付費客戶'}[kind]):kind==='interview'?'Talk with 2 founders':title;check('Legacy keeps current action '+locale+kind,await article.getByRole('heading',{name:localizedTitle,exact:true}).count()===1&&await article.locator('[data-today-priority]').count()===1);
      check('Legacy actual action and milestone counts '+locale+kind,(await page.locator('[data-next-step="goal"]').innerText()).includes('2 / 3')&&(await page.locator('#action-map > summary').innerText()).includes(zh?'查看全部 1 個里程碑':'View all 1 milestone'));
      check('Legacy secondary tools default '+locale+kind,await page.locator('#legacy-tools').evaluate(e=>e.open)===commercial);
      if(commercial){const evidence=article.getByRole('link',{name:w('付款／簽約證據 →','Payment / contract evidence →'),exact:true});await evidence.waitFor();check('Legacy payment work has its original evidence entry '+locale+kind,true);await page.locator('#legacy-tools > summary').click();await evidence.click();await page.locator('#legacy-tools[open]').waitFor();check('Legacy payment link opens the right records '+locale+kind,new URL(page.url()).hash==='#validation-'+owner.planId);}
      for(const width of [390,768,1440]) {
        await page.setViewportSize({width,height:1000});check('Legacy responsive '+locale+kind+width,await page.evaluate(l=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.lang===l,locale));
        const boxes=await article.locator('[data-task-columns] > *').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));check('Legacy columns and title '+locale+kind+width,width===1440?Math.abs(boxes[0].y-boxes[1].y)<2:boxes[1].y>boxes[0].y&&await article.locator('[data-today-priority]').evaluate(e=>e.querySelector('h2').getBoundingClientRect().width>=e.getBoundingClientRect().width*.7));
        check('Legacy primary touch target '+locale+kind+width,await article.locator('[data-today-priority] button').evaluate(e=>e.getBoundingClientRect().height>=44));
        if(['positioning','interview','generic'].includes(kind))await screenshot(page,'legacy-'+kind+'-'+locale+'-'+width);
      }
      check('Viewing legacy plan never rewrites its data '+locale+kind,await snapshot()===before);
    }
    // A plan with no roadmap keeps its actual steps and does not gain milestones.
    await db.actionPlan.update({where:{id:owner.planId},data:{goal:null}});await db.actionItem.update({where:{id:actionId},data:{title:'Write a positioning statement',taskWorkspace:positioning,metricTarget:1,metricCurrent:1}});
    const noMap=await snapshot();await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('[data-legacy-task]').waitFor();check('Legacy plan without roadmap shows real steps '+locale,(await page.locator('#action-map > summary').innerText()).includes(zh?'查看全部 3 個步驟':'View all 3 steps'));check('No-roadmap view retains all data '+locale,await snapshot()===noMap);
    const map=page.locator('#action-map');await map.locator(':scope > summary').focus();await page.keyboard.press('Enter');check('Legacy map keyboard opens '+locale,await map.evaluate(e=>e.open));await page.keyboard.press('Enter');check('Legacy map keyboard closes '+locale,!await map.evaluate(e=>e.open));
    await page.getByRole('button',{name:w('繼續本步行動','Work on this step'),exact:true}).click();check('Legacy primary action focuses its work '+locale,await page.locator('#task-work-'+actionId).evaluate(e=>e.contains(document.activeElement)));
    const who=page.getByLabel(w('你幫助哪一類客戶','Who you help (your target customer)'),{exact:true});await who.fill('Retained unsaved legacy draft');await page.reload();await who.waitFor();check('Legacy local draft survives reload '+locale,await who.inputValue()==='Retained unsaved legacy draft');
    const save=page.getByRole('button',{name:w('儲存定位句','Save statement'),exact:true});const route='**/api/action-plans/actions/'+actionId;
    await page.route(route,r=>r.request().method()==='PATCH'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA save unavailable',code:'qa_legacy_save',requestId:'qa-legacy-trace'})}):r.continue());
    let response=waitResponse(page,r=>r.url().endsWith('/actions/'+actionId)&&r.request().method()==='PATCH');await save.click();assert.equal((await response).status(),503);await page.getByRole('alert').filter({hasText:'qa_legacy_save'}).waitFor();check('Legacy save error is complete and retains input '+locale,(await page.getByRole('alert').allInnerTexts()).some(t=>t.includes('503')&&t.includes('qa-legacy-trace'))&&await who.inputValue()==='Retained unsaved legacy draft');await page.unroute(route);
    await db.actionPlan.update({where:{id:owner.planId},data:{revision:{increment:1}}});response=waitResponse(page,r=>r.url().endsWith('/actions/'+actionId)&&r.request().method()==='PATCH');await save.click();assert.equal((await response).status(),409);await page.getByRole('button',{name:w('比較最新版本並重試','Compare latest version and retry'),exact:true}).click();response=waitResponse(page,r=>r.url().endsWith('/actions/'+actionId)&&r.request().method()==='PATCH');await save.click();assert.equal((await response).status(),200);check('Legacy conflict retry saves only its original workspace '+locale,(await db.actionItem.findUniqueOrThrow({where:{id:actionId}})).taskWorkspace.who==='Retained unsaved legacy draft');
    const previous=page.getByText(w('前項任務成果','Previous task findings'),{exact:true});await previous.click();await page.getByText('Original saved next step',{exact:true}).waitFor();check('Completed legacy findings remain available '+locale,true);
    await page.clock.install();await page.goto(origin+prefix+'/dashboard/matchmaking?tab=prospects');await page.waitForURL(/dashboard\/agenda#prospects/);await page.locator('#legacy-tools[open]').waitFor();await page.getByRole('region',{name:w('找新公司','Find new companies'),exact:true}).waitFor();check('Legacy search deep link opens tools '+locale,true);
    let calls=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/prospects'&&r.method()==='GET')calls++;});const activePoll=waitResponse(page,r=>new URL(r.url()).pathname==='/api/prospects'&&r.request().method()==='GET');await page.clock.fastForward(61000);await activePoll;check('Legacy visible search polls '+locale,calls>0);await page.locator('#legacy-tools > summary').click();const count=calls;await page.clock.fastForward(61000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);check('Legacy hidden search stops polling '+locale,calls===count);
    check('Completed legacy tasks, findings and interviews stay byte-identical '+locale,await historical()===originalHistory);
    const after=await context.request.get(origin+'/api/action-plans/roadmap');const active=(await after.json()).data.active;check('Legacy plan is not converted or renumbered '+locale,active.workflowVersion!==2&&active.actions.length===3&&active.actions.map(a=>a.id).join(',')===[saved[1].id,saved[2].id,actionId].join(','));
    await context.close();
  }
}
async function flowCore(key, width, locale) {
  const zh = locale === 'zh-tw', w = (a, b) => zh ? a : b, prefix = zh ? '/zh-tw' : '';
  const { context, page } = await session(key, width, true);
  const oldPlan = users[key].planId;
  const before = JSON.stringify(await db.actionItem.findMany({ where: { actionPlanId: oldPlan }, orderBy: { id: 'asc' } }));
  const diagnosis = { companyStage: 'MVP', stageReason: 'Saved company evidence', stageConfidence: 70, bottleneckGroup: 'Sales', bottleneckCode: 'no_leads', bottleneckReason: 'Find paying customers', bottleneckConfidence: 65 };
  const generated = await context.request.post(origin + '/api/action-plans/generate', { headers: { origin }, data: { locale, requestId: randomUUID(), candidateCount: 5, diagnosis, answers: [{ question: 'Progress', answer: 'Working MVP' }, { question: 'Bottleneck', answer: 'Customer demand' }, { question: 'Goal', answer: 'Build a steady paying customer base' }] } });
  const generatedBody = await generated.json();
  check('Create real version-two plan ' + width + ' HTTP ' + generated.status() + (generatedBody.error ? ': ' + generatedBody.error : ''), generated.status() === 201);
  const plan = generatedBody.data;
  users[key].flowActionIds = plan.actions.map(a => a.id); users[key].flowPlanId = plan.id;
  check('Five milestones and sixteen actions ' + width, plan.workflowVersion === 2 && plan.actions.length === 16 && plan.roadmap.milestones.length === 5);
  await page.goto(origin + prefix + '/dashboard/agenda'); await page.locator('#action-map').waitFor(); await closeTour(page);
  if (zh) {
    const skip = page.getByRole('button', { name: '略過導覽', exact: true });
    if (await skip.isVisible()) await skip.click();
  }
  const article = page.locator('article[data-next-step="record"]');
  const saveLabel = w('儲存本步成果', 'Save this step'), completeLabel = w('確認並完成', 'Confirm and complete');
  async function postClick(label) {
    const response = waitResponse(page, r => r.request().method() === 'POST' && r.url().includes('/api/action-plans/flow'));
    await page.getByRole('button', { name: label, exact: true }).click();
    return (await response).status();
  }
  async function saved() { check('Save current step ' + width, await postClick(saveLabel) === 200); await page.getByRole('button', { name: saveLabel, exact: true }).waitFor({ state: 'visible' }); }
  async function completed(title) {
    await page.waitForFunction(name => [...document.querySelectorAll('button')].some(b => b.textContent === name && !b.disabled), completeLabel);
    check('Complete current step ' + width, await postClick(completeLabel) === 200);
    await article.getByRole('heading', { name: title, exact: true }).waitFor();
    check('Only current-step work form remains '+width,await article.locator('#task-work > fieldset').count()===1);
    const guided=article.locator('[data-guided-fields]').first();
    if(await guided.isVisible()){
      const before=await guided.locator('input,textarea,select').evaluateAll(nodes=>nodes.map(n=>n.value));
      check('One question group visible '+locale+title,await guided.locator(':scope > div:not([hidden])').count()===2);
      await guided.getByRole('button',{name:w('下一題','Next'),exact:true}).click();await guided.getByRole('button',{name:w('上一題','Back'),exact:true}).click();
      check('Guided navigation retains values '+locale+title,JSON.stringify(await guided.locator('input,textarea,select').evaluateAll(nodes=>nodes.map(n=>n.value)))===JSON.stringify(before));
    }
    const full=article.getByRole('button',{name:w('切換完整表單','Switch to complete form'),exact:true});if(await full.count())await full.click();
  }
  async function responsive(name) {
    for (const size of [390, 768, 1440]) {
      await page.setViewportSize({ width: size, height: 1000 });
      const value = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > innerWidth + 1, lang: document.documentElement.lang }));
      check(name + ' ' + locale + ' ' + size, value.h1 === 1 && !value.overflow && value.lang === locale);
    }
    await page.setViewportSize({ width, height: 1000 });
  }
  await responsive('Conversation template');
  await openInputOptions(page,locale);await article.getByRole('button',{name:w('聊聊／語音整理','Talk / speech drafting'),exact:true}).click();check('Talk entry opens source drafting '+locale,await article.locator('[data-task-assist]').evaluate(e=>e.open));await article.locator('[data-task-assist] > summary').click();await article.getByText(w('更多輸入方式','More input options'),{exact:true}).click();
  check('Initial goal expands map ' + width, await page.locator('#action-map').evaluate(e => e.open));
  check('Only one actionable map step ' + width, await page.locator('#action-map button').count() === 1);
  await page.locator('#action-map > summary').click();
  await article.getByLabel(w('目標市場／國家', 'Target market / country'), { exact: true }).fill('TW');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (let i = 0; i < 10; i++) {
    await article.getByRole('button', { name: w('＋ 記錄客戶對話', '＋ Record a conversation'), exact: true }).click();
    const row = article.locator('[data-conversation-form]');
    await row.getByRole('button', { name: w('潛在客戶', 'Potential customer'), exact: true }).click();
    await row.getByRole('button', { name: w('符合', 'Fits'), exact: true }).click();
    for (const [label, value] of [[w('公司', 'Company'), 'Flow company ' + i], [w('對象姓名', 'Person'), 'Person ' + i], [w('對話日期', 'Conversation date'), date], [w('主要痛點與原話', 'Main pain and customer wording'), 'Manual reporting'], [w('目前的解決方式', 'Current solution'), 'Spreadsheets']]) await row.getByLabel(label, { exact: true }).fill(value);
    await row.getByRole('button', { name: w('高', 'High'), exact: true }).click();
    await row.getByRole('button', { name: w('願意', 'Willing'), exact: true }).click();
    if (i === 8) { await saved(); check('Nine conversations cannot complete ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled()); }
  }
  await db.actionPlan.update({ where: { id: plan.id }, data: { revision: { increment: 1 } } });
  check('New workflow CAS returns 409 ' + width, await postClick(saveLabel) === 409);
  const delayedGet = '**/api/action-plans/flow?*';
  await page.route(delayedGet, async route => { if (route.request().method() === 'GET') await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); });
  const comparison = waitResponse(page, r => r.request().method() === 'GET' && r.url().includes('/api/action-plans/flow'));
  await page.getByRole('button', { name: w('比較最新版本並保留草稿', 'Compare latest version and keep draft'), exact: true }).click();
  check('Conflict reload locks save until latest revision ' + width, await page.getByRole('button', { name: saveLabel, exact: true }).isDisabled());
  await comparison; await page.unroute(delayedGet);

  check('Conflict keeps tenth conversation ' + width, await article.getByLabel(w('對象姓名', 'Person'), { exact: true }).last().inputValue() === 'Person 9');
  await saved(); await page.reload(); await article.getByRole('heading', { name: w('與 10 位目標客戶對話，確認痛點與付費意願', 'Talk with 10 target customers about pain and willingness to pay'), exact: true }).waitFor();
  check('Goal expansion is shown once ' + width, !await page.locator('#action-map').evaluate(e => e.open));
  await screenshot(page, 'flow-conversation-' + locale + '-' + width);
  await completed(w('寫出一句話定位，並請 5 位受訪者確認', 'Write a positioning statement and confirm it with five conversation participants'));
  const originalCompleted = JSON.stringify(await db.actionItem.findUnique({where:{id:plan.actions[0].id}}));
  if(!await page.locator('#action-map').evaluate(e=>e.open))await page.locator('#action-map > summary').click();
  await page.locator('#action-map').getByRole('button',{name:/01-1/}).click();
  const chooser=article.getByLabel(w('選擇對話紀錄','Choose a conversation record'),{exact:true});
  check('Completed conversations remain navigable '+locale,await chooser.isEnabled());
  await chooser.selectOption(await chooser.locator('option').first().getAttribute('value'));
  check('Completed conversation fields stay read only '+locale,await article.getByLabel(w('公司','Company'),{exact:true}).isDisabled()&&await article.getByLabel(w('公司','Company'),{exact:true}).inputValue()==='Flow company 0');
  check('Reading another completed record does not mutate it '+locale,JSON.stringify(await db.actionItem.findUnique({where:{id:plan.actions[0].id}}))===originalCompleted);
  await page.getByRole('button',{name:w('回到目前一步','Return to the current step'),exact:true}).click();
  await article.getByRole('heading',{name:w('寫出一句話定位，並請 5 位受訪者確認','Write a positioning statement and confirm it with five conversation participants'),exact:true}).waitFor();
  if(await page.locator('#action-map').evaluate(e=>e.open))await page.locator('#action-map > summary').click();
  const fourFields=[[w('目標客戶（誰）','Target customer (who)'),'B2B founders'],[w('情境（什麼時候最痛）','Situation (when it hurts)'),'before sales outreach'],[w('要解決的痛點','Problem to solve'),'unclear customer needs'],[w('與現有做法的差別','Difference from current solutions'),'reviewed customer evidence']];
  for(const [label,value] of fourFields)await article.getByLabel(label,{exact:true}).fill(value);
  const preview=await article.locator('[data-positioning-editor] blockquote').innerText();
  check('Four fields preview without changing saved statement '+locale,preview.includes('B2B founders')&&!(await db.actionItem.findUnique({where:{id:plan.actions[1].id}})).taskWorkspace?.data?.values?.positioning);
  await article.getByRole('button',{name:w('套用預覽到定位草稿','Apply preview to the positioning draft'),exact:true}).click();
  await article.getByText(w('直接編輯一句話定位','Edit the full positioning statement'),{exact:true}).click();
  check('Applying preview changes draft only '+locale,await article.getByLabel(w('一句話定位','Positioning statement'),{exact:true}).inputValue()===preview);

  await article.getByLabel(w('一句話定位', 'Positioning statement'), { exact: true }).fill('We help founders replace manual reporting with reliable customer evidence.');
  await article.getByRole('checkbox', { name: w('我已核對並確認這一項', 'I reviewed and confirm this item'), exact: true }).check();
  await saved();await article.getByText(w('直接編輯一句話定位','Edit the full positioning statement'),{exact:true}).click(); check('Owner cannot claim five replies ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled());
  const anonymous = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': testIp } }); contexts.push(anonymous);
  const confirmationLinks = new Set();
  for (let i = 0; i < 5; i++) {
    await article.getByRole('group',{name:w('選擇受訪者','Choose a conversation participant'),exact:true}).getByRole('button').nth(i).click();
    check('Generate private confirmation link ' + width, await postClick(w('建立確認連結', 'Create confirmation link')) === 200);
    const link = await page.getByLabel(w('專屬連結（可複製）', 'Dedicated link (copy to share)'), { exact: true }).inputValue();
    check('Each interviewee receives a new dedicated link ' + width + ' ' + i, !confirmationLinks.has(link)); confirmationLinks.add(link);
    const url = new URL(link), id = url.pathname.split('/').at(-1);
    if (i === 0) {
      const recipient = await anonymous.newPage(); await recipient.goto(link);
      await recipient.getByRole('button', { name: w('符合，這就是我的情況', 'Yes, this describes my situation'), exact: true }).click();
      await recipient.getByRole('status').waitFor(); await screenshot(recipient, 'flow-confirmation-' + locale + '-' + width); await recipient.close();
    } else check('Anonymous interviewee response ' + width, (await anonymous.request.post(origin + '/api/action-plans/confirm/' + id, { headers: { origin }, data: { token: url.searchParams.get('token'), answer: 'yes' } })).status() === 200);
    const refreshed = waitResponse(page, r => r.request().method() === 'GET' && r.url().includes('/api/action-plans/flow'));
    await article.getByRole('button', { name: w('更新回覆', 'Refresh responses'), exact: true }).click();
    const refreshedState = await (await refreshed).json();
    check('Server counts the correct interviewee response ' + width + ' ' + i, refreshedState.data.steps.find(s => s.id === '01-2').current === i + 1);
    await page.waitForFunction(name => [...document.querySelectorAll('button')].some(b => b.textContent === name && !b.disabled), w('更新回覆', 'Refresh responses'));
    check('Confirmation table matches saved current version '+locale+' '+i,await article.locator('#positioning-confirmations tbody tr').count()===10&&(await article.locator('#positioning-confirmations tbody').innerText()).includes(w('符合','Fits'))&&refreshedState.data.positioningReplies.filter(r=>r.answer==='yes').length===i+1);
    if(i===2){
      const table=article.locator('#positioning-confirmations');check('Priority shows three real confirmations '+locale,(await article.locator('[data-today-priority]').innerText()).includes('3 / 5'));
      for(const size of [390,768,1440]){await page.setViewportSize({width:size,height:1100});await page.locator('[data-next-step="goal"]').scrollIntoViewIfNeeded();check('Positioning layout '+locale+size,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));const boxes=await article.locator('[data-task-columns] > *').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));check('Work and guide columns '+locale+size,size===1440?Math.abs(boxes[0].y-boxes[1].y)<2:boxes[1].y>boxes[0].y);check('Real confirmation statuses '+locale+size,await table.getByText(w('符合','Fits'),{exact:true}).count()===3&&await table.getByText(w('未回覆','No response'),{exact:true}).count()===7);check('Task touch targets '+locale+size,await article.locator('button:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=43)));if(size<=768)check('Mobile and tablet priority title has full width '+locale,await article.locator('[data-today-priority]').evaluate(e=>e.querySelector('h2').getBoundingClientRect().width>=e.getBoundingClientRect().width*.7));await screenshot(page,'flow-positioning-'+locale+'-'+size);}
      const map=page.locator('#action-map');await map.locator(':scope > summary').focus();await page.keyboard.press('Enter');check('Action map opens with keyboard '+locale,await map.evaluate(e=>e.open));await page.keyboard.press('Enter');check('Action map closes with keyboard '+locale,!await map.evaluate(e=>e.open));
      await page.setViewportSize({width,height:1000});
    }

  }
  await anonymous.close();
  await article.getByLabel(w('目標客戶（誰）','Target customer (who)'),{exact:true}).fill('Updated customer segment');await saved();
  check('Unapplied positioning keeps five replies but blocks completion '+locale,await article.getByRole('button',{name:completeLabel,exact:true}).isDisabled()&&(await article.locator('[data-today-priority]').innerText()).includes('5 / 5'));
  await article.getByText(w('直接編輯一句話定位','Edit the full positioning statement'),{exact:true}).click();const original='We help founders replace manual reporting with reliable customer evidence.';
  await article.getByLabel(w('一句話定位','Positioning statement'),{exact:true}).fill(original+' ');await article.getByLabel(w('一句話定位','Positioning statement'),{exact:true}).fill(original);await article.getByRole('checkbox',{name:w('我已核對並確認這一項','I reviewed and confirm this item'),exact:true}).check();await saved();
  check('Keeping the original statement retains external replies '+locale,await article.getByRole('button',{name:completeLabel,exact:true}).isEnabled());
  await completed(w('建立潛在客戶評分標準', 'Define lead qualification criteria'));
  for (const checkbox of await article.getByRole('checkbox', { name: w('確認條件與權重', 'Confirm criterion and weight'), exact: true }).all()) await checkbox.check();
  await saved(); await screenshot(page, 'flow-organize-' + locale + '-' + width);
  await completed(w('將已對話的客戶分級', 'Score and tier your conversation participants'));
  const tierCards = article.locator('fieldset > section');
  for (let i = 0; i < await tierCards.count(); i++) {
    const checks = tierCards.nth(i).getByRole('checkbox');
    if (i < 3) for (let n = 0; n < 4; n++) await checks.nth(n).check();
    else { await tierCards.nth(i).getByLabel(w('手動調整（選填）','Manual override (optional)'),{exact:true}).selectOption('C');await tierCards.nth(i).getByLabel(w('調整理由','Override reason'),{exact:true}).fill('QA: explicitly defer these leads while testing the three-priority-lead path'); }
    await checks.last().check();
  }
  await saved();
  await completed(w('向 3 位 A 級客戶提出付費試點', 'Send paid pilot proposals to three A leads'));
  check('Milestone completion expands map ' + width, await page.locator('#action-map').evaluate(e => e.open));
  check('Only confirmed A leads carried to proposals ' + width, await article.locator('fieldset > div > details').count() === 3);
  const proposals = article.locator('fieldset > div > details');
  for (let i = 0; i < await proposals.count(); i++) {
    await proposals.nth(i).locator('summary').click();
    const row = proposals.nth(i);
    await row.getByLabel(w('實際聯絡日期', 'Actual contact date'), { exact: true }).fill(date);
    await row.getByLabel(w('管道', 'Channel'), { exact: true }).selectOption('Email');
    await row.getByLabel(w('聯絡狀態', 'Contact status'), { exact: true }).selectOption('sent');
    await row.getByLabel(w('聯絡訊息／價格、範圍與期間', 'Message / price, scope and duration'), { exact: true }).fill('USD100 reporting pilot for fourteen days, with agreed success criteria.');
  }
  await saved(); await responsive('Outreach template'); await screenshot(page, 'flow-outreach-' + locale + '-' + width);
  await completed(w('取得付款或簽約證據', 'Obtain payment or signed contract evidence'));
  await page.getByRole('heading', { name: w('付款與合約證明', 'Payment and contract proof'), exact: true }).waitFor();
  await responsive('Document template');
  check('No proof cannot complete ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled());
  await page.getByLabel(w('選擇證明所屬公司', "Select the proof's company"), { exact: true }).selectOption('Flow company 0');
  await page.getByLabel(w('目前狀態', 'Current status'), { exact: true }).selectOption('paid');
  await screenshot(page, 'flow-document-' + locale + '-' + width);
  check('Old completed records remain byte-identical ' + width, JSON.stringify(await db.actionItem.findMany({ where: { actionPlanId: oldPlan }, orderBy: { id: 'asc' } })) === before);
  check('Old plan is archived ' + width, Boolean((await db.actionPlan.findUnique({ where: { id: oldPlan } })).archivedAt));
  const history = page.getByText(w('計畫歷史與新計畫', 'Plan history and a new plan'), {exact:true}).locator('..');
  await openTaskTools(page);await history.locator('summary').click();
  const historyResponse = waitResponse(page, r => r.request().method() === 'GET' && r.url().includes('planId=' + oldPlan));
  await history.getByRole('button').nth(1).click(); await historyResponse;
  const goalHeader = page.locator('header[data-next-step="goal"]');
  await goalHeader.getByText(w('歷史版本，唯讀','Archived, read only'), { exact: false }).waitFor();
  check('Archived plan shows its actual task count ' + width, !(await goalHeader.innerText()).includes('16') && (await goalHeader.innerText()).includes('/ ' + JSON.parse(before).length));
  const activeResponse = waitResponse(page, r => r.request().method() === 'GET' && r.url().includes('planId=' + plan.id));
  await page.getByRole('button', { name: w('回到目前計畫', 'Return to the active plan'), exact: true }).click(); await activeResponse;
  await page.getByRole('heading', { name: w('取得付款或簽約證據', 'Obtain payment or signed contract evidence'), exact: true }).waitFor();
  check('Return from history preserves the active step ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled());
  let prospectRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/prospects'&&request.method()==='GET')prospectRequests++;});
  await page.clock.install();await page.goto(origin+prefix+'/dashboard/matchmaking?tab=prospects');await page.waitForURL(/dashboard\/agenda#prospects/);await page.locator('#task-tools[open] #prospects[open]').waitFor();await page.getByRole('region',{name:w('找新公司','Find new companies'),exact:true}).waitFor();check('Legacy prospect link opens nested search '+locale,true);
  const beforeActivePoll=prospectRequests,poll=waitResponse(page,response=>new URL(response.url()).pathname==='/api/prospects'&&response.request().method()==='GET');await page.clock.fastForward(61000);await poll;check('Visible prospect search polls '+locale,prospectRequests>beforeActivePoll);await page.locator('#task-tools > summary').click();const requestsBeforeHidden=prospectRequests;await page.clock.fastForward(61000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);check('Hidden task tools stop prospect polling '+locale,prospectRequests===requestsBeforeHidden);
  await context.close();
}

async function flowDocumentAndReview() {
  const { context, page } = await session('complete', 1440);
  const diagnosis = { companyStage: 'MVP', stageReason: 'QA saved evidence', stageConfidence: 70, bottleneckGroup: 'Sales', bottleneckCode: 'no_leads', bottleneckReason: 'Find customers', bottleneckConfidence: 65 };
  const response = await context.request.post(origin + '/api/action-plans/generate', { headers: { origin }, data: { locale: 'en', requestId: randomUUID(), candidateCount: 5, diagnosis, answers: [{ question: 'Progress', answer: 'Working MVP' }, { question: 'Bottleneck', answer: 'Find customers' }, { question: 'Goal', answer: 'Steady customers' }] } });
  assert.equal(response.status(), 201); const plan = (await response.json()).data;
  users.complete.flowActionIds = plan.actions.map(a => a.id);
  const handbook = plan.actions.find(a => a.clientKey === 'nova_v2_03-3');
  await db.actionItem.update({ where: { id: handbook.id }, data: { taskWorkspace: { version: 2, step: '03-3', data: { kind: 'document', sections: [3, 1, 0, 2].map(i => ({ id: String(i), body: ('QA chapter ' + i + ': use reviewed customer evidence, record actual outreach, preserve private proof and review the next action.\n').repeat(8), confirmed: true })) } } } });
  await page.goto(origin + '/task-report/' + handbook.id);
  await page.getByRole('heading', { name: 'Complete your acquisition playbook', exact: true }).waitFor();
  check('Document chapters use canonical ID order', (await page.locator('main > section h2').allInnerTexts()).map(v=>v.replace(/^\d+\s*·\s*/, '')).join('|') === 'Lead sources|Outreach message|Conversation script|Closing steps');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    check('Document preview layout ' + width, await page.evaluate(() => document.querySelectorAll('h1').length === 1 && document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.emulateMedia({ media: 'print' }); await page.evaluate(() => document.fonts.ready);
  check('Print omits action controls', !await page.getByRole('button', { name: 'Print / save as PDF', exact: true }).isVisible());
  check('Print omits cursor decoration', await page.locator('[data-custom-cursor]').evaluateAll(nodes => nodes.every(e => getComputedStyle(e).display === 'none')));
  const pdf = path.join(output, 'flow-handbook.pdf'); await page.pdf({ path: pdf, format: 'A4', printBackground: true });
  check('Native PDF export is a PDF file', fs.readFileSync(pdf).subarray(0, 5).toString() === '%PDF-');
  await page.emulateMedia({ media: 'screen' }); await screenshot(page, 'flow-handbook-preview');
  const proofId = randomUUID(), date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const deal = await db.deal.create({ data: { userId: users.desktop.id, title: 'Flow company 0', stage: 'won', validation: { scope: { planId: users.desktop.flowPlanId }, company: 'Flow company 0', name: 'QA buyer', version: 1, status: 'paid', events: [], proofs: [{ id: proofId, kind: 'paid', amount: '100', currency: 'USD', date, pathname: 'commercial-evidence/' + users.desktop.id + '/' + randomUUID() + '.pdf', filename: 'QA-missing-proof.pdf', confirmed: true, review: { status: 'pending' } }] } } });
  const anonymous = await browser.newContext(); contexts.push(anonymous);
  check('Anonymous cannot read evidence review queue', (await anonymous.request.get(origin + '/api/admin/task-evidence')).status() === 401);
  const privatePage = await anonymous.newPage(); await privatePage.goto(origin + '/task-report/' + handbook.id);
  check('Anonymous cannot preview private handbook', (await privatePage.getByRole('alert').filter({ hasText: 'HTTP 404' }).innerText()).includes('404') && await privatePage.getByText('QA chapter', { exact: false }).count() === 0);
  await privatePage.close();

  check('Member cannot read evidence review queue', (await context.request.get(origin + '/api/admin/task-evidence')).status() === 401);
  const member = await session('desktop', 1440);
  await member.page.goto(origin + '/dashboard/agenda'); await member.page.getByRole('heading', { name: 'Payment and contract proof', exact: true }).waitFor();
  const admin = await browser.newContext({ viewport: { width: 390, height: 1000 } }); contexts.push(admin);
  const token = await new SignJWT({ email: 'qa-reviewer-' + suffix + '@example.invalid', role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(authSecret));
  await admin.addCookies([{ name: 'admin_session', value: token, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const review = await admin.newPage(); review.on('pageerror', error => report.browserErrors.push(error.message));
  await review.goto(origin + '/admin/task-evidence'); await review.getByRole('heading', { name: 'Flow company 0 · 實際付款', exact: true }).waitFor();
  for (const width of [390, 1440]) { await review.setViewportSize({ width, height: 1000 }); check('Admin review layout ' + width, await review.evaluate(() => document.querySelectorAll('h1').length === 1 && document.documentElement.scrollWidth <= innerWidth + 1)); }
  await review.getByLabel('本次核對理由', { exact: true }).fill('QA fixture has no uploaded file; request a correction.');
  let decision = waitResponse(review, r => r.request().method() === 'PATCH' && r.url().includes('/api/admin/task-evidence'));
  await review.getByRole('button', { name: '核對通過', exact: true }).click();
  check('Missing private storage cannot approve proof', (await decision).status() === 503);
  await review.getByRole('alert').filter({ hasText: 'HTTP 503' }).waitFor();
  check('Review error keeps reason and HTTP status', (await review.getByRole('alert').filter({ hasText: 'HTTP 503' }).innerText()).includes('503') && (await review.getByLabel('本次核對理由', { exact: true }).inputValue()).includes('QA fixture'));
  decision = waitResponse(review, r => r.request().method() === 'PATCH' && r.url().includes('/api/admin/task-evidence'));
  await review.getByRole('button', { name: '要求補正', exact: true }).click();
  check('Administrator rejection persists through real API', (await decision).status() === 200);
  check('Rejected proof stays rejected', (await db.deal.findUnique({ where: { id: deal.id } })).validation.proofs[0].review.status === 'rejected');
  await member.page.getByRole('button', { name: 'Refresh review status', exact: true }).click();
  await member.page.getByText('Review rejected; correct the evidence', { exact: false }).first().waitFor();
  check('Member can refresh decision without losing the task', await member.page.getByRole('button', { name: 'Confirm and complete', exact: true }).isDisabled());
  await member.context.close();
  await screenshot(review, 'flow-review-admin');
  await context.close(); await anonymous.close(); await admin.close();
}

const createdRoundtables = [];
async function roundtableCore(hostKey, memberKey, width, locale, approvalMode) {
  const zh = locale === 'zh-tw', w = (a, b) => zh ? a : b, prefix = zh ? '/zh-tw' : '';
  const { context: host, page } = await session(hostKey, width, true);
  const topic = 'QA roundtable ' + locale + ' ' + suffix, publicName = 'QA Mentor ' + locale;
  const originalActions = JSON.stringify(await db.actionItem.findMany({ where: { actionPlan: { userId: users[memberKey].id } }, orderBy: { id: 'asc' } }));
  await page.goto(origin + prefix + '/dashboard/matchmaking?tab=roundtables');
  const panel = page.locator('#matchmaking-panel-roundtables');
  const mentorSection = panel.locator('details').filter({ has: page.locator('summary').filter({ hasText: w('導師認證與主持', 'Mentor certification and hosting') }) });
  await mentorSection.locator('summary').click();
  await mentorSection.getByLabel(w('公開導師名稱', 'Public mentor name'), { exact: true }).fill(publicName);
  await mentorSection.getByLabel(w('專業簡介（至少 20 字）', 'Professional bio (at least 20 characters)'), { exact: true }).fill('Experienced founder helping teams test real customer demand and pilot offers.');
  await mentorSection.getByLabel(w('可協助的問題與經驗（至少 10 字）', 'Expertise and experience (at least 10 characters)'), { exact: true }).fill('Customer interviews, qualification criteria and paid pilots.');
  await mentorSection.getByLabel(w('佐證網址（每行一個，僅本人及管理員可見）', 'Evidence URLs (one per line; private to you and administrators)'), { exact: true }).fill('https://example.com/private-qa-reference-' + locale);
  await mentorSection.getByRole('checkbox', { name: w('同意認證資料使用', 'Consent to certification use'), exact: true }).check();
  let response = waitResponse(page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
  await mentorSection.getByRole('button', { name: w('送出導師認證申請', 'Submit mentor application'), exact: true }).click();
  check('Mentor application through real UI ' + locale, (await response).status() === 200);
  check('Pending mentor cannot host ' + locale, await mentorSection.getByRole('button', { name: w('建立圓桌會議', 'Create roundtable'), exact: true }).count() === 0);
  check('Member cannot access mentor review queue ' + locale, (await host.request.get(origin + '/api/admin/mentors')).status() === 401);
  const admin = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(admin);
  const token = await new SignJWT({ email: 'qa-mentor-reviewer-' + suffix + '@example.invalid', role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(authSecret));
  await admin.addCookies([{ name: 'admin_session', value: token, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const review = await admin.newPage(); review.on('pageerror', error => report.browserErrors.push(error.message));
  await review.goto(origin + '/admin/mentors');
  const card = review.locator('article').filter({ has: review.getByRole('heading', { name: publicName + ' · ' + users[hostKey].email, exact: true }) });
  await card.getByLabel('本次核對理由', { exact: true }).fill('Professional background and public references verified in this QA fixture.');
  response = waitResponse(review, r => r.request().method() === 'PATCH' && r.url().endsWith('/api/admin/mentors'));
  await card.getByRole('button', { name: '認證通過', exact: true }).click();
  check('Administrator approves mentor through UI ' + locale, (await response).status() === 200);
  check('Certification retains member role and plan ' + locale, (await db.matchmakingProfile.findUnique({ where: { userId: users[hostKey].id } })).role === (hostKey === 'investor' ? 'investor' : 'founder') && (await db.user.findUnique({ where: { id: users[hostKey].id } })).plan === 'business');
  await panel.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).click();
  const create = mentorSection.locator('form');
  await create.getByLabel(w('圓桌主題', 'Session topic'), { exact: true }).fill(topic);
  await create.getByLabel(w('交流目的與會前準備', 'Purpose and preparation'), { exact: true }).fill('Bring actual customer evidence and discuss one measurable next action.');
  await create.getByLabel(w('總人數（含主持導師）', 'Total capacity (including the host)'), { exact: true }).selectOption('4');
  const start = await page.evaluate(() => { const d = new Date(Date.now() + 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  await create.getByLabel(w('開始時間（使用瀏覽器時區）', 'Start time (your browser time zone)'), { exact: true }).fill(start);
  await create.getByLabel(w('報名方式', 'Registration mode'), { exact: true }).selectOption(approvalMode ? 'approval' : 'instant');
  await create.getByLabel(w('HTTPS 會議連結（僅主持與正式成員可見）', 'HTTPS meeting URL (host and confirmed members only)'), { exact: true }).fill('https://meet.google.com/private-' + locale + '-qa');
  response = waitResponse(page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
  await create.getByRole('button', { name: w('建立圓桌會議', 'Create roundtable'), exact: true }).click();
  const createdResponse = await response, createdBody = await createdResponse.json();
  check('Certified mentor creates session ' + locale + (createdBody.error ? ': ' + createdBody.error : ''), createdResponse.status() === 200 && Boolean(createdBody.data.selectedId));
  const id = createdBody.data.selectedId; createdRoundtables.push(id);
  const publicState = await (await host.request.get(origin + '/api/roundtables?id=' + id)).json();
  check('Host is counted within capacity ' + locale, publicState.data.sessions.find(s => s.id === id).confirmed === 1);
  async function responsive(target, name) {
    for (const size of [390, 768, 1440]) {
      await target.setViewportSize({ width: size, height: 1000 });
      check(name + ' ' + locale + ' ' + size, await target.evaluate(() => document.querySelectorAll('h1').length === 1 && document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await target.setViewportSize({ width, height: 1000 });
  }
  await responsive(page, 'Host creation and details'); await screenshot(page, 'roundtable-host-' + locale);
  await responsive(review, 'Mentor review'); await screenshot(review, 'roundtable-mentor-review-' + locale);
  const memberContext = await browser.newContext({ viewport: { width, height: 1000 }, extraHTTPHeaders: { 'x-forwarded-for': testIp } }); contexts.push(memberContext);
  const memberPage = await memberContext.newPage();
  memberPage.on('pageerror', error => report.browserErrors.push(error.message)); memberPage.on('dialog', dialog => dialog.accept());
  const member = { context: memberContext, page: memberPage };
  await member.page.goto(origin + prefix + '/roundtables/' + id);
  check('Registration URL carries a safe login return path ' + locale, new URL(member.page.url()).pathname === prefix + '/login' && new URL(member.page.url()).searchParams.get('next') === prefix + '/roundtables/' + id);
  await member.page.locator('input[name="email"]').fill(users[memberKey].email);
  await member.page.locator('input[name="password"]').fill(password);
  await member.page.getByRole('button', { name: w('登入', 'Log in'), exact: true }).click();
  await member.page.waitForURL(origin + prefix + '/dashboard/matchmaking?tab=roundtables&roundtable=' + id);
  check('Member login returns to the requested roundtable ' + locale, true);
  const detail = member.page.locator('#roundtable-detail');
  await detail.getByRole('heading', { name: topic, exact: true }).waitFor();
  check('Stranger sees no private meeting URL ' + locale, await detail.getByRole('link', { name: w('開啟會議連結', 'Open meeting link'), exact: true }).count() === 0);
  await detail.getByLabel(w('本場顯示名稱', 'Name for this session'), { exact: true }).fill('Primary founder ' + locale);
  await detail.getByLabel(w('最想交流的問題與會前準備', 'Question and preparation for the group'), { exact: true }).fill('How do I test this paid pilot offer with actual buyers?');
  await detail.getByRole('checkbox', { name: w('同意同組分享', 'Consent to group sharing'), exact: true }).check();
  response = waitResponse(member.page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
  await detail.getByRole('button', { name: w('申請加入', 'Apply to join'), exact: true }).click();
  check('Founder applies through real UI ' + locale, (await response).status() === 200);
  async function state() { return (await (await host.request.get(origin + '/api/roundtables?id=' + id)).json()).data.sessions.find(s => s.id === id); }
  async function approve(registrationId) {
    const fresh = await state();
    const r = await host.request.post(origin + '/api/roundtables', { headers: { origin }, data: { action: 'decide', id, revision: fresh.revision, registrationId, decision: 'approve', reason: 'Relevant actual customer evidence' } });
    assert.equal(r.status(), 200, 'Host application approval');
  }
  if (approvalMode) {
    check('Pending application gets no meeting link ' + locale, await detail.getByRole('link', { name: w('開啟會議連結', 'Open meeting link'), exact: true }).count() === 0);
    await panel.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).click();
    const person = page.locator('#roundtable-detail article').filter({ hasText: 'Primary founder ' + locale });
    await person.getByLabel(w('處理理由', 'Decision reason'), { exact: true }).fill('The founders question fits this topic.');
    response = waitResponse(page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
    await person.getByRole('button', { name: w('核准申請', 'Approve application'), exact: true }).click();
    check('Host reviews application through real UI ' + locale, (await response).status() === 200);
    await member.page.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).click();
  }
  await detail.getByRole('link', { name: w('開啟會議連結', 'Open meeting link'), exact: true }).waitFor();
  await responsive(member.page, 'Application and confirmed member'); await screenshot(member.page, 'roundtable-member-' + locale);
  const fillers = ['desktop', 'mobile', 'blocked', 'outcome', 'complete', 'newpaid'].filter(k => k !== memberKey && k !== hostKey).slice(0, 3);
  const fillerContexts = [];
  for (const key of fillers) fillerContexts.push(await session(key, width));
  const applications = await Promise.all(fillers.map((key, i) => fillerContexts[i].context.request.post(origin + '/api/roundtables', { headers: { origin }, data: { action: 'apply', id, name: 'QA founder ' + key, question: 'A private question about qualifying real buyers.', consent: true } })));
  check('Concurrent real applications keep the seat lock live ' + locale, applications.every(r => r.status() === 200));
  if (approvalMode) for (const key of fillers) await approve((await db.roundtableRegistration.findUniqueOrThrow({ where: { roundtableId_userId: { roundtableId: id, userId: users[key].id } } })).id);
  let row = await state();
  check('Full capacity has a real approved waitlist ' + locale, row.confirmed === 4 && row.waiting === 1);
  const registrations = await db.roundtableRegistration.findMany({ where: { roundtableId: id } });
  const waiting = registrations.find(r => r.status === 'waitlisted' && r.approvedAt);
  const leaving = registrations.find(r => r.status === 'confirmed' && r.userId !== users[memberKey].id);
  const leavingIndex = fillers.findIndex(key => users[key].id === leaving.userId);
  const withdrawal = await fillerContexts[leavingIndex].context.request.post(origin + '/api/roundtables', { headers: { origin }, data: { action: 'withdraw', id } });
  check('Withdrawal promotes oldest approved waiter ' + locale, withdrawal.status() === 200 && (await db.roundtableRegistration.findUniqueOrThrow({ where: { id: waiting.id } })).status === 'confirmed');
  check('Promoted member receives an in-app notice ' + locale, await db.memberNotification.count({ where: { userId: waiting.userId, eventKey: { startsWith: 'roundtable:' + id + ':seat:' } } }) === 1);
  await panel.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).click();
  const linkSection = page.locator('#roundtable-detail details').filter({ has: page.locator('summary').filter({ hasText: w('更新會議連結', 'Update meeting link') }) });
  await linkSection.locator('summary').click();
  const fresh = await state();
  assert.equal((await host.request.post(origin + '/api/roundtables', { headers: { origin }, data: { action: 'meetingLink', id, revision: fresh.revision, meetingUrl: 'https://meet.google.com/concurrent-' + locale } })).status(), 200);
  await linkSection.getByLabel(w('新會議連結', 'New meeting URL'), { exact: true }).fill('https://meet.google.com/preserved-draft-' + locale);
  response = waitResponse(page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
  await linkSection.getByRole('button', { name: w('儲存會議連結', 'Save meeting URL'), exact: true }).click();
  check('Real host CAS conflict returns 409 ' + locale, (await response).status() === 409);
  await panel.getByRole('alert').filter({ hasText: 'HTTP 409' }).waitFor();
  check('Conflict preserves meeting-link draft ' + locale, (await linkSection.getByLabel(w('新會議連結', 'New meeting URL'), { exact: true }).inputValue()).includes('preserved-draft'));
  await panel.getByRole('button', { name: w('載入最新狀態並保留草稿', 'Load latest state and keep draft'), exact: true }).click();
  await panel.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).waitFor();
  await page.waitForFunction(name => [...document.querySelectorAll('button')].some(b => b.textContent === name && !b.disabled), w('儲存會議連結', 'Save meeting URL'));
  response = waitResponse(page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
  await linkSection.getByRole('button', { name: w('儲存會議連結', 'Save meeting URL'), exact: true }).click();
  check('Host draft retries against the latest revision ' + locale, (await response).status() === 200);
  await page.route('**/api/roundtables?*', async route => { if (route.request().method() === 'GET') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA temporary read failure', code: 'qa_roundtable_read', requestId: 'qa-roundtable-trace' }) }); else await route.continue(); });
  await panel.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).click();
  await panel.getByRole('alert').filter({ hasText: 'HTTP 503' }).waitFor();
  check('Read failure shows safe status and trace ' + locale, (await panel.getByRole('alert').innerText()).includes('qa-roundtable-trace'));
  check('Read failure preserves host draft ' + locale, (await linkSection.getByLabel(w('新會議連結', 'New meeting URL'), { exact: true }).inputValue()).includes('preserved-draft'));
  await page.unroute('**/api/roundtables?*');
  await panel.getByRole('button', { name: w('載入最新狀態並保留草稿', 'Load latest state and keep draft'), exact: true }).click();
  await page.waitForFunction(name => [...document.querySelectorAll('button')].some(b => b.textContent === name && !b.disabled), w('儲存會議連結', 'Save meeting URL'));
  // Advance only the owned fixture's clock instead of adding a production time-bypass switch.
  await db.roundtable.update({ where: { id }, data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) } });
  await panel.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).click();
  const outcomes = page.locator('#roundtable-detail details').filter({ has: page.locator('summary').filter({ hasText: w('會後出席與承諾', 'Attendance and commitments') }) });
  await outcomes.locator('summary').click();
  const outcomeRows = outcomes.locator('form > fieldset > div');
  await outcomeRows.nth(0).getByLabel(w('實際出席', 'Attendance'), { exact: true }).waitFor();
  const count = await outcomeRows.count();
  assert.equal(count, 3);
  const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < count; i++) {
    const r = outcomeRows.nth(i);
    await r.getByLabel(w('實際出席', 'Attendance'), { exact: true }).selectOption(i === 1 ? 'absent' : 'attended');
    if (i !== 1) {
      await r.getByLabel(w('承諾行動', 'Committed action'), { exact: true }).fill('Interview three buyers ' + locale + ' ' + i);
      await r.getByLabel(w('可衡量的完成標準', 'Measurable completion criteria'), { exact: true }).fill('Save three real buyer conversations and compare the main pain.');
      await r.getByLabel(w('承諾期限', 'Commitment deadline'), { exact: true }).fill(dueDate);
    }
  }
  await responsive(page, 'Post-session outcomes'); await screenshot(page, 'roundtable-outcomes-' + locale);
  response = waitResponse(page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
  await outcomes.getByRole('button', { name: w('確認結案並寫入今日任務', "Finish and add commitments to today's tasks"), exact: true }).click();
  check('Host finalizes actual attendance and commitments ' + locale, (await response).status() === 200);
  check('Only attendees get one task each ' + locale, await db.weekCalendarItem.count({ where: { requestId: { startsWith: 'roundtable:' + id + ':' } } }) === 2);
  await member.page.getByRole('button', { name: w('更新場次與名額', 'Refresh sessions and seats'), exact: true }).click();
  await detail.getByRole('link', { name: w('查看今日任務承諾', "View commitments in today's tasks"), exact: true }).click();
  const commitments = member.page.locator('#roundtable-commitments');
  await commitments.waitFor(); await closeTour(member.page);
  const zhSkip = member.page.getByRole('button', { name: '略過導覽', exact: true }); if (await zhSkip.isVisible()) await zhSkip.click();
  if (!await commitments.evaluate(e => e.open)) await commitments.locator('summary').click();
  await responsive(member.page, 'Commitments within today tasks'); await screenshot(member.page, 'roundtable-commitment-' + locale);
  response = waitResponse(member.page, r => r.request().method() === 'POST' && r.url().endsWith('/api/roundtables'));
  await commitments.getByRole('button', { name: w('標示承諾已完成', 'Mark commitment done'), exact: true }).click();
  check('Member completes own commitment through real UI ' + locale, (await response).status() === 200);
  await commitments.getByRole('button', { name: w('重新開啟承諾', 'Reopen commitment'), exact: true }).waitFor();
  check('Original action-plan results stay byte-identical ' + locale, JSON.stringify(await db.actionItem.findMany({ where: { actionPlan: { userId: users[memberKey].id } }, orderBy: { id: 'asc' } })) === originalActions);
  check('No invitation emails are sent ' + locale, await db.memberNotificationDelivery.count({ where: { notification: { userId: { in: created.map(u => u.id) }, kind: 'roundtable' } } }) === 0);
  check('Approved mentor has a separate public badge ' + locale, (await (await member.context.request.get(origin + '/api/matchmaking/members/' + (await db.matchmakingProfile.findUnique({ where: { userId: users[hostKey].id } })).id)).json()).data.mentorCertified === true);
  await host.close(); await member.context.close(); await admin.close(); for (const c of fillerContexts) await c.context.close();
}

async function tokenCore(senderKey, recipientKey, width, locale, resolution) {
  const w = (zh, en) => locale === 'zh-tw' ? zh : en, prefix = locale === 'zh-tw' ? '/zh-tw' : '';
  const sender = await session(senderKey, width), recipient = await session(recipientKey, width);
  const profile = await db.matchmakingProfile.findUniqueOrThrow({ where: { userId: users[recipientKey].id } });
  await sender.page.goto(origin + prefix + '/dashboard/matchmaking');
  await sender.page.getByText(/Token (餘額|balance) 150/, { exact: false }).waitFor();
  check('Monthly Token grant visible ' + width + locale, (await db.tokenWallet.findUniqueOrThrow({ where: { userId: users[senderKey].id } })).available === 150);
  await sender.page.goto(origin + prefix + '/dashboard/matchmaking/' + profile.id);
  await sender.page.getByRole('button', { name: w('提出交流 · 預扣 5 Token', 'Request to chat · hold 5 Token'), exact: true }).waitFor();
  const opening = 'QA Token opening ' + width + locale;
  await sender.page.getByRole('textbox', { name: w('建議開場 · 可編輯', 'Suggested message · editable'), exact: true }).fill(opening);
  let submitted, inject = true;
  await sender.page.route('**/api/network/connections', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON(); if (submitted) check('Invitation retry retains request UUID ' + locale + width, body.requestId === submitted.requestId); else submitted = body;
    const response = await route.fetch();
    if (inject) { inject = false; assert.equal(response.status(), 201); return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA lost acknowledgement; retry original invitation.', code: 'qa_ack_lost', requestId: 'qa-safe-token-trace' }) }); }
    return route.fulfill({ response });
  });
  let response = waitResponse(sender.page, r => r.request().method() === 'POST' && r.url().endsWith('/api/network/connections'));
  await sender.page.getByRole('button', { name: w('提出交流 · 預扣 5 Token', 'Request to chat · hold 5 Token'), exact: true }).click();
  assert.equal((await response).status(), 503);
  await sender.page.getByRole('alert').filter({ hasText: 'qa_ack_lost' }).waitFor();
  check('Safe fee error includes HTTP code and trace ' + locale + width, (await sender.page.getByRole('alert').allInnerTexts()).some(v => v.includes('503') && v.includes('qa-safe-token-trace')));
  check('Fee retry retains opening ' + locale + width, await sender.page.getByRole('textbox', { name: w('建議開場 · 可編輯', 'Suggested message · editable') }).inputValue() === opening);
  response = waitResponse(sender.page, r => r.request().method() === 'POST' && r.url().endsWith('/api/network/connections'));
  await sender.page.getByRole('button', { name: w('提出交流 · 預扣 5 Token', 'Request to chat · hold 5 Token'), exact: true }).click(); assert.equal((await response).status(), 201);
  const hold = await db.tokenReservation.findUniqueOrThrow({ where: { userId_requestId: { userId: users[senderKey].id, requestId: submitted.requestId } } });
  check('Lost acknowledgement creates one 5 Token hold ' + locale + width, hold.amount === 5 && await db.tokenLedger.count({ where: { reservationId: hold.id, kind: 'reserve' } }) === 1);
  await recipient.page.goto(origin + prefix + '/dashboard/matchmaking?tab=messages&connection=' + hold.resourceId);
  await recipient.page.getByText(opening, { exact: true }).waitFor();
  if (resolution === 'expire') await db.tokenReservation.update({ where: { id: hold.id }, data: { expiresAt: new Date(0) } });
  const acting = resolution === 'cancel' ? sender : recipient;
  if (resolution === 'cancel') await sender.page.goto(origin + prefix + '/dashboard/matchmaking?tab=messages&connection=' + hold.resourceId);
  const label = resolution === 'cancel' ? w('撤回邀請並退回預扣', 'Cancel invitation and release hold') : resolution === 'decline' ? w('拒絕', 'decline') : w('接受聊天邀請', 'accept');
  response = waitResponse(acting.page, r => r.request().method() === 'PATCH' && r.url().endsWith('/connections/' + hold.resourceId));
  await acting.page.getByRole('button', { name: label, exact: true }).click();
  check('Invitation resolution ' + resolution + locale + width, (await response).status() === (resolution === 'expire' ? 409 : 200));
  const settled = await db.tokenReservation.findUniqueOrThrow({ where: { id: hold.id } });
  check('Fee settlement ' + resolution + locale + width, settled.status === (resolution === 'accept' ? 'captured' : 'released'));
  const balance = await db.tokenWallet.findUniqueOrThrow({ where: { userId: users[senderKey].id } });
  check('Correct final fee ' + resolution + locale + width, balance.available === (resolution === 'accept' ? 145 : 150) && balance.reserved === 0);
  check('Opening delivered once only on acceptance ' + locale + width, await db.networkMessage.count({ where: { connectionId: hold.resourceId, body: opening } }) === (resolution === 'accept' ? 1 : 0));
  check('Fee settlement never shares private data ' + locale + width, await db.networkShare.count({ where: { connectionId: hold.resourceId } }) === 0);
  await sender.page.goto(origin + prefix + '/dashboard/matchmaking');
  await sender.page.getByText(/Token (餘額|balance) (145|150)/, { exact: false }).waitFor();
  await sender.page.locator('header details > summary').first().click();
  await sender.page.getByText(w('收支紀錄', 'Transaction history'), { exact: true }).click();
  if (locale === 'en') check('English ledger descriptions stay English ' + width, !/[\u4e00-\u9fff]/.test(await sender.page.locator('section[aria-label="Token"]').innerText()));
  const bounds = await sender.page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, headings: document.querySelectorAll('h1').length }));
  check('Token ledger layout ' + locale + width, !bounds.overflow && bounds.headings === 1);
  await screenshot(sender.page, 'tokens-' + locale + '-' + width);
  await sender.context.close(); await recipient.context.close();
}

async function tokenAdminAndSearch() {
  const admin = await browser.newContext({ viewport: { width: 768, height: 1000 } }); contexts.push(admin);
  const token = await new SignJWT({ email: 'qa-token-reviewer-' + suffix + '@example.invalid', role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(authSecret));
  await admin.addCookies([{ name: 'admin_session', value: token, domain: hostname, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await admin.newPage(); page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.goto(origin + '/admin/tokens'); await page.getByLabel('會員 ID', { exact: true }).fill(users.newpaid.id);
  let response = waitResponse(page, r => r.url().includes('/api/admin/tokens?')); await page.getByRole('button', { name: '查詢帳本', exact: true }).click(); assert.equal((await response).status(), 200);
  await page.getByLabel('加退點數量', { exact: true }).fill('25'); await page.getByLabel('原因', { exact: true }).fill('QA approved Token adjustment');
  response = waitResponse(page, r => r.url().endsWith('/api/admin/tokens') && r.request().method() === 'POST'); await page.getByRole('button', { name: '確認加退點', exact: true }).click(); assert.equal((await response).status(), 200);
  check('Admin adjustment visible in ledger', await db.tokenLedger.count({ where: { userId: users.newpaid.id, reason: 'QA approved Token adjustment', availableDelta: 25 } }) === 1);
  await screenshot(page, 'tokens-admin-768');
  const member = await session('desktop', 390);
  check('Member cannot adjust Token', (await member.context.request.post(origin + '/api/admin/tokens', { headers: { origin }, data: { userId: users.newpaid.id, amount: 999, reason: 'Unauthorized', requestId: randomUUID() } })).status() === 401);
  await member.page.goto(origin + '/dashboard/agenda#prospects'); await closeTour(member.page);
  const search = member.page.locator('section[data-next-step="new-companies"]');
  await search.getByRole('textbox', { name: 'Target buyer description', exact: true }).fill('QA business inventory operations buyers');
  await search.getByRole('checkbox').check();
  response = waitResponse(member.page, r => r.url().endsWith('/api/prospects/orders') && r.request().method() === 'POST');
  await search.getByRole('button', { name: 'Find 5 new companies · hold 20 Token', exact: true }).click(); assert.equal((await response).status(), 202);
  const receipt = await (await response).json(), request = (await response).request().postDataJSON();
  check('Search UI confirms new 5 / 20 price', request.count === 5 && request.pricingVersion === 1);
  const retry = await member.context.request.post(origin + '/api/prospects/orders', { headers: { origin }, data: request }); assert.equal(retry.status(), 202);
  check('Search retry keeps original order', (await retry.json()).data.id === receipt.data.id);
  const hold = await db.tokenReservation.findFirstOrThrow({ where: { resourceId: receipt.data.id } }); check('Search holds 20 once', hold.amount === 20 && await db.tokenLedger.count({ where: { reservationId: hold.id, kind: 'reserve' } }) === 1);
  await db.tokenReservation.update({ where: { id: hold.id }, data: { expiresAt: new Date(0) } });
  assert.equal((await member.context.request.get(origin + '/api/tokens')).status(), 200);
  check('Unsubmitted search expires and refunds', (await db.tokenReservation.findUniqueOrThrow({ where: { id: hold.id } })).status === 'released');
  await member.page.reload(); await closeTour(member.page); await search.getByText('20 Token · Hold released', { exact: true }).waitFor();
  const layout = await member.page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, headings: document.querySelectorAll('h1').length })); check('Search mobile layout', !layout.overflow && layout.headings === 1);
  check('Token scenarios never debit AI', await db.aiUsage.count({ where: { userId: { in: created.map(u => u.id) } } }) === 0);
  await screenshot(member.page, 'tokens-search-390');
  await member.context.close(); await admin.close();
}

async function pdfCompletion() {
  const publicContext = await browser.newContext({extraHTTPHeaders:{"x-forwarded-for":testIp}});contexts.push(publicContext);
  const publicPage=await publicContext.newPage();publicPage.on('pageerror',e=>report.browserErrors.push(e.message));
  for(const locale of ['en','zh-tw'])for(const width of [390,768,1440]){
    const prefix=locale==='en'?'':'/zh-tw';await publicPage.setViewportSize({width,height:1000});await publicPage.goto(origin+prefix+'/product',{waitUntil:'domcontentloaded'});
    await publicPage.getByRole('heading',{level:1}).waitFor();
    check('Public landing '+locale+width,await publicPage.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));
    await publicPage.evaluate(()=>scrollTo(0,0));
    try{await publicPage.waitForFunction(()=>[...document.images].filter(i=>i.loading!=='lazy').every(i=>i.complete&&i.naturalWidth>0));}catch(error){throw new Error('Eager image failure: '+JSON.stringify(await publicPage.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.loading!=='lazy').map(i=>({src:i.currentSrc,complete:i.complete,width:i.naturalWidth})))),{cause:error});}
    check('Public real offer '+locale+width,!/80% off|15 qualified|\[Photo/.test(await publicPage.locator('body').innerText()));
    const email=`qa-newsletter-${suffix}-${locale}-${width}@example.invalid`;newsletterEmails.push(email);await publicPage.getByRole('textbox',{name:locale==='en'?'Email address':'Email 地址',exact:true}).fill(email);
    await publicPage.getByRole('checkbox').check();const result=waitResponse(publicPage,r=>r.url().endsWith('/api/newsletter')&&r.request().method()==='POST');
    await publicPage.getByRole('button',{name:locale==='en'?'Request confirmation email ↗':'寄送訂閱確認信 ↗',exact:true}).click();
    const status=(await result).status();check('Unavailable or throttled email preserves input '+locale+width,[503,429].includes(status)&&await publicPage.getByRole('textbox',{name:locale==='en'?'Email address':'Email 地址',exact:true}).inputValue()===email);
    await publicPage.getByRole('alert').filter({hasText:'HTTP '+status}).waitFor();
    const height=await publicPage.evaluate(()=>document.body.scrollHeight);for(let y=0;y<height;y+=850){await publicPage.evaluate(y=>scrollTo(0,y),y);await publicPage.waitForTimeout(70);}await screenshot(publicPage,'pdf-public-'+locale+'-'+width);
  }
  await publicContext.close();
  for(const [key,locale] of [['mobile','zh-tw'],['desktop','en']]){
    const zh=locale==='zh-tw',w=(a,b)=>zh?a:b,prefix=zh?'/zh-tw':'';const {context,page}=await session(key,390);
    await context.addInitScript(()=>{window.SpeechRecognition=class {start(){window.qaSpeech=this;}stop(){this.onend?.();}abort(){this.aborted=true;this.onend?.();}};});
    await page.goto(origin+prefix+'/dashboard/profile');
    const panel=page.getByRole('region',{name:w('驗證框架與目標客戶假設','Validation framework and customer hypotheses')});
    await panel.getByRole('button',{name:w('新增一個假設版本','Add a hypothesis version'),exact:true}).click();
    await panel.getByRole('textbox',{name:w('假設描述','Hypothesis'),exact:true}).fill('Operations teams with reporting pain');await page.reload();
    await panel.getByRole('textbox',{name:w('假設描述','Hypothesis'),exact:true}).waitFor();check('Hypothesis draft survives reload '+locale,await panel.getByRole('textbox',{name:w('假設描述','Hypothesis'),exact:true}).inputValue()==='Operations teams with reporting pain');
    for(const [label,value] of [[w('為什麼可能','Why it may fit'),'Repeated manual work'],[w('怎麼驗證','How to test'),'Ask about actual reporting']])await panel.getByRole('textbox',{name:label,exact:true}).fill(value);
    let response=waitResponse(page,r=>r.url().endsWith('/api/evidence')&&r.request().method()==='POST');await panel.getByRole('button',{name:w('確認並儲存假設','Confirm and save hypothesis'),exact:true}).click();assert.equal((await response).status(),200);
    response=waitResponse(page,r=>r.url().endsWith('/api/evidence')&&r.request().method()==='POST');await panel.getByRole('button',{name:w('用這個假設驗證','Test this hypothesis'),exact:true}).click();assert.equal((await response).status(),200);
    const noteDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    for(let i=0;i<5;i++)await db.meetingNote.create({data:{userId:users[key].id,title:'Owned QA conversation',insight:{stage:'discover',type:'Prospect',company:'QA Evidence '+i,name:'Person '+i,role:'Buyer',fit:'yes',region:'TW',industry:'saas',date:noteDate,notes:'Manual reporting is slow',answers:['','','',''],commercial:{quote:'Manual reporting is slow',willingness:'not_asked'}}}});
    await panel.getByRole('button',{name:w('重新核對','Refresh evidence'),exact:true}).click();
    await panel.locator('summary').filter({hasText:w('為目前假設核對對話佐證','Review conversation evidence for this hypothesis')}).click();
    const fits=panel.getByLabel(w('是否符合目標客群','Target customer fit'),{exact:true});await fits.first().waitFor();check('Owned saved sources available '+locale,await fits.count()===5);for(const fit of await fits.all())await fit.selectOption('yes');
    response=waitResponse(page,r=>r.url().endsWith('/api/evidence')&&r.request().method()==='POST');await panel.getByRole('button',{name:w('確認並儲存佐證關聯','Save evidence links'),exact:true}).click();assert.equal((await response).status(),200);
    await panel.getByRole('heading',{name:zh?'你目前在第 4 階段：驗證付費意願':'Stage 4: Validate willingness to pay',exact:true}).waitFor();check('Server evidence stage '+locale,true);
    for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Evidence profile '+locale+width,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'pdf-evidence-'+locale+'-'+width);}
    await page.goto(origin+prefix+'/dashboard/matchmaking?tab=messages');const preferences=page.locator('summary').filter({hasText:w('任務、圓桌與交流 Email 提醒','Task, roundtable and connection emails')});check('One email preferences panel '+locale,await preferences.count()===1);await preferences.click();
    const pref=page.locator('details').filter({has:page.getByRole('button',{name:w('儲存通知偏好','Save email preferences'),exact:true})});
    check('Email categories default off '+locale,await pref.getByRole('checkbox').evaluateAll(nodes=>nodes.every(n=>!n.checked)));
    await pref.getByRole('checkbox').first().check();response=waitResponse(page,r=>r.url().endsWith('/api/evidence')&&r.request().method()==='POST');await pref.getByRole('button',{name:w('儲存通知偏好','Save email preferences'),exact:true}).click();assert.equal((await response).status(),200);
    const diagnosis={companyStage:'MVP',stageReason:'Owned QA evidence',stageConfidence:70,bottleneckGroup:'Sales',bottleneckCode:'no_leads',bottleneckReason:'Find real customers',bottleneckConfidence:65};
    const generated=await context.request.post(origin+'/api/action-plans/generate',{headers:{origin},data:{locale,requestId:randomUUID(),candidateCount:5,diagnosis,answers:[{question:'Progress',answer:'Working MVP'},{question:'Bottleneck',answer:'Unverified customer demand'},{question:'Goal',answer:'Verify demand'}]}});assert.equal(generated.status(),201);const plan=(await generated.json()).data;users[key].flowActionIds=plan.actions.map(a=>a.id);
    await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('article[data-next-step="record"]').waitFor();await closeTour(page,locale);
    await openInputOptions(page,locale);await page.getByRole('button',{name:w('聊聊／語音整理','Talk / speech drafting'),exact:true}).click();check('Talk entry does not start microphone '+locale,await page.evaluate(()=>!window.qaSpeech&&document.activeElement?.tagName!=='TEXTAREA'));const transcript=page.getByRole('textbox',{name:w('貼上會議紀錄或逐字稿','Paste meeting notes or a transcript'),exact:true});await transcript.fill('Existing transcript');
    const speechStart=page.getByRole('button',{name:w('開始語音轉寫','Start speech transcription'),exact:true}),speechCancel=page.getByRole('button',{name:w('取消啟動','Cancel speech start'),exact:true});
    await speechStart.click();check('Speech waits for actual start '+locale,await speechCancel.isVisible()&&await page.getByRole('status').filter({hasText:w('正在啟動語音辨識','Starting speech recognition')}).isVisible());
    await speechCancel.click();check('Pending speech can cancel without losing draft '+locale,await speechStart.isVisible()&&await transcript.inputValue()==='Existing transcript'&&await page.evaluate(()=>window.qaSpeech.aborted&&window.qaSpeech.onstart===null&&window.qaSpeech.onresult===null));
    await speechStart.click();await page.getByRole('alert').filter({hasText:'start-timeout'}).waitFor({timeout:25000});check('Speech start timeout restores retry '+locale,await speechStart.isVisible()&&await transcript.inputValue()==='Existing transcript');
    await speechStart.click();await page.evaluate(()=>{window.qaSpeech.onstart();window.qaSpeech.onend();});await page.getByRole('alert').filter({hasText:'no-result'}).waitFor();check('Silent speech end gives actionable feedback '+locale,await speechStart.isVisible()&&await transcript.inputValue()==='Existing transcript');
    await speechStart.click();await page.evaluate(()=>window.qaSpeech.onstart());const speechStop=page.getByRole('button',{name:w('停止收音','Stop listening'),exact:true});await speechStop.waitFor();check('Speech shows listening only after start '+locale,await speechStop.isVisible());await page.evaluate(()=>{window.qaSpeech.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'Spoken words'}}]});window.qaSpeech.abort=()=>{throw Error('QA already stopped');};window.qaSpeech.onerror({error:'not-allowed',message:'QA permission declined'});});await page.getByRole('alert').filter({hasText:'not-allowed · QA permission declined'}).waitFor();check('Speech failure restores retry even if abort throws '+locale,await speechStart.isVisible());
    await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(e=>e.value.includes('Spoken words')));check('Speech result and failure retain text '+locale,(await transcript.inputValue()).includes('Spoken words'));await page.reload();await openInputOptions(page,locale);await page.locator('summary').filter({hasText:w('語音／逐字稿與 AI 草稿協助','Speech, transcript and AI drafting')}).click();check('Transcript draft survives navigation '+locale,(await transcript.inputValue()).includes('Spoken words'));
    await speechStart.click();await page.evaluate(()=>window.qaSpeech.onstart());await speechStop.waitFor();await page.locator('[data-task-assist] > summary').click();await page.waitForFunction(()=>window.qaSpeech.aborted&&window.qaSpeech.onresult===null);check('Closing speech panel stops capture '+locale,await page.evaluate(()=>window.qaSpeech.onstart===null));await openInputOptions(page,locale);await page.getByRole('button',{name:w('聊聊／語音整理','Talk / speech drafting'),exact:true}).click();check('Reopening speech keeps transcript '+locale,(await transcript.inputValue()).includes('Spoken words'));
    await speechStart.click();await page.evaluate(()=>window.qaSpeech.onstart());await speechStop.waitFor();await page.getByText(w('更多輸入方式','More input options'),{exact:true}).click();await page.waitForFunction(()=>window.qaSpeech.aborted&&window.qaSpeech.onresult===null);check('Closing input options stops hidden capture '+locale,true);await openInputOptions(page,locale);await page.getByRole('button',{name:w('聊聊／語音整理','Talk / speech drafting'),exact:true}).click();
    response=waitResponse(page,r=>r.url().endsWith('/api/action-plans/assist')&&r.request().method()==='POST');await page.getByRole('button',{name:w('產生未確認草稿 · 使用 1 次 AI 額度','Generate unconfirmed draft · uses 1 AI allowance'),exact:true}).click();check('AI failure returns safe server error '+locale,(await response).status()>=400);await page.getByRole('alert').filter({hasText:'HTTP'}).waitFor();check('AI failure retains transcript '+locale,(await transcript.inputValue()).includes('Spoken words'));
    const attempts=[];await page.route('**/api/action-plans/assist',async route=>{attempts.push(route.request().postDataJSON());if(attempts.length===1){await db.actionPlan.update({where:{id:plan.id},data:{revision:{increment:1}}});await route.abort();}else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA lost response retry verified',code:'qa-retry',requestId:'qa-safe-retry'})});});
    const generateButton=page.getByRole('button',{name:w('產生未確認草稿 · 使用 1 次 AI 額度','Generate unconfirmed draft · uses 1 AI allowance'),exact:true});const refreshed=waitResponse(page,r=>r.url().includes('/api/action-plans/flow?')&&r.request().method()==='GET');await generateButton.click();await refreshed;await page.getByRole('alert').filter({hasText:'fetch'}).waitFor();response=waitResponse(page,r=>r.url().endsWith('/api/action-plans/assist')&&r.request().method()==='POST');await generateButton.click();assert.equal((await response).status(),503);check('Lost AI response keeps original request and revision '+locale,attempts.length===2&&JSON.stringify(attempts[0])===JSON.stringify(attempts[1]));await page.unroute('**/api/action-plans/assist');
    for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Speech task '+locale+width,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'pdf-task-'+locale+'-'+width);}
    const reportStep=zh?'03-3':'05-3',handbook=plan.actions.find(a=>a.clientKey==='nova_v2_'+reportStep);await db.actionItem.update({where:{id:handbook.id},data:{taskWorkspace:{version:2,step:reportStep,data:{kind:'document',sections:[0,1,2,3].map(i=>({id:String(i),body:((!zh&&i===0?'Conclusion: QA saved evidence is ready for review.\n':'')+'QA saved source chapter '+i+' — reviewed customer evidence.\n').repeat(5),confirmed:false}))}}}});
    await page.goto(origin+prefix+'/task-report/'+handbook.id);await page.getByRole('img',{name:w('本報告唯讀驗證入口 QR Code',"QR code for this report's read-only verification page"),exact:true}).waitFor();if(!zh)await page.getByRole('heading',{level:1,name:'QA saved evidence is ready for review.',exact:true}).waitFor();const qr=page.getByRole('img',{name:w('本報告唯讀驗證入口 QR Code',"QR code for this report's read-only verification page"),exact:true});fs.writeFileSync(path.join(output,'report-qr-'+locale+'.png'),Buffer.from((await qr.getAttribute('src')).split(',')[1],'base64'));
    for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Report QR layout '+locale+width,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'pdf-report-'+locale+'-'+width);}
    await page.emulateMedia({media:'print'});await page.pdf({path:path.join(output,'report-'+locale+'.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});await context.close();
  }
}


async function guidedEntryQA() {
  for(const [key,locale] of [['mobile','zh-tw'],['desktop','en']]){
    const zh=locale==='zh-tw',w=(a,b)=>zh?a:b,prefix=zh?'/zh-tw':'';const {context,page}=await session(key,390);
    const response=await context.request.post(origin+'/api/action-plans/generate',{headers:{origin},data:{locale,requestId:randomUUID(),candidateCount:5,diagnosis:{companyStage:'MVP',stageReason:'QA evidence',stageConfidence:70,bottleneckGroup:'Sales',bottleneckCode:'no_leads',bottleneckReason:'Demand',bottleneckConfidence:65},answers:[{question:'Progress',answer:'Working MVP'},{question:'Bottleneck',answer:'Customer demand'},{question:'Goal',answer:'Verify demand'}]}});assert.equal(response.status(),201);
    await page.goto(origin+prefix+'/dashboard/agenda');const article=page.locator('article[data-next-step="record"]');await article.waitFor();await closeTour(page,locale);
    await openInputOptions(page,locale);await article.getByRole('button',{name:w('聊聊／語音整理','Talk / speech drafting'),exact:true}).click();
    check('Talk entry opens without focusing text '+locale,await article.locator('[data-task-assist]').evaluate(e=>e.open&&document.activeElement?.tagName==='SUMMARY'));
    const transcript=article.getByRole('textbox',{name:w('貼上會議紀錄或逐字稿','Paste meeting notes or a transcript'),exact:true});await transcript.fill('QA owned source words');await article.locator('[data-task-assist] > summary').click();
    await article.getByRole('button',{name:w('逐題點選整理','Work through questions'),exact:true}).click();await page.waitForFunction(()=>document.querySelector('#task-work > fieldset')?.contains(document.activeElement));check('Question entry focuses its form '+locale,await article.locator('fieldset').evaluate(e=>e.contains(document.activeElement)));
    await openInputOptions(page,locale);await article.getByRole('button',{name:w('聊聊／語音整理','Talk / speech drafting'),exact:true}).click();check('Entry changes retain transcript '+locale,await transcript.inputValue()==='QA owned source words');
    for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Guided entry layout '+locale+width,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'guided-entry-'+locale+'-'+width);}
    await context.close();
  }
}

async function layoutQA() {
  for (const [key,locale] of [['desktop','en'],['mobile','zh-tw']]) {
    const zh=locale==='zh-tw',prefix=zh?'/zh-tw':'',w=(a,b)=>zh?a:b;
    const {context,page}=await session(key,1440);
    for(const width of [390,768,1440]) {
      await page.setViewportSize({width,height:1000});await page.goto(origin+prefix+'/dashboard');
      await page.locator('[data-home-evidence] ol li').first().waitFor();await page.getByRole('heading',{name:w('本週證據','THIS WEEK’S EVIDENCE'),exact:true}).count();
      await page.getByText(w('查看佐證','Review evidence'),{exact:false}).first().waitFor();
      check('Five evidence stages precede the task '+locale+width,await page.locator('[data-home-evidence]').evaluate(e=>e.querySelector('ol').compareDocumentPosition(e.querySelector('#home-task-title'))&Node.DOCUMENT_POSITION_FOLLOWING));
      check('Home three utility cards '+locale+width,await page.getByRole('button',{name:w('設定提醒','Set reminders'),exact:true}).isVisible());
      const evidence=await context.request.get(origin+'/api/evidence');const summary=(await evidence.json()).data;
      check('Weekly evidence uses actual server counts '+locale+width,evidence.ok()&&Number.isInteger(summary.weekly.conversations)&&Number.isInteger(summary.weekly.findings)&&Number.isInteger(summary.weekly.commitments));
      if(width===390){await page.getByRole('button',{name:w('設定提醒','Set reminders'),exact:true}).click();await page.getByText(w('任務、圓桌與交流 Email 提醒','Task, roundtable and connection emails'),{exact:true}).waitFor();check('Home opens existing email preferences '+locale,true);await page.getByRole('button',{name:w('設定提醒','Set reminders'),exact:true}).click();await page.getByRole('button',{name:w('加入行事曆','Add to calendar'),exact:true}).click();await page.locator('#this-week').waitFor();check('Home opens existing calendar '+locale,await page.locator('#this-week button').count()>0);await page.getByRole('button',{name:w('加入行事曆','Add to calendar'),exact:true}).click();}
      await layout(page,'Target home '+locale+width,locale);await screenshot(page,'target-home-'+locale+'-'+width);
      await page.goto(origin+prefix+'/dashboard/matchmaking?tab=recommendations');await page.locator('#matchmaking-panel-recommendations article').first().waitFor();
      check('Compact card has offer and need '+locale+width,(await page.locator('#matchmaking-panel-recommendations article').first().innerText()).includes(w('可以提供','Can offer')));
      check('Wallet is collapsed '+locale+width,!await page.locator('header details').first().evaluate(e=>e.open));
      await layout(page,'Target matching '+locale+width,locale);await screenshot(page,'target-matching-'+locale+'-'+width);
      await page.getByRole('tab',{name:w('推薦給你','For you'),exact:true}).focus();await page.keyboard.press('ArrowRight');check('Tabs support keyboard '+locale+width,await page.getByRole('tab',{name:w('所有會員','All members'),exact:true}).getAttribute('aria-selected')==='true');
      await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('[data-legacy-task]').waitFor();await closeTour(page,locale);await layout(page,'Target legacy '+locale+width,locale);await screenshot(page,'target-legacy-'+locale+'-'+width);
    }
    const generated=await context.request.post(origin+'/api/action-plans/generate',{headers:{origin},data:{locale,requestId:randomUUID(),candidateCount:5,diagnosis:{companyStage:'MVP',stageReason:'QA source',stageConfidence:70,bottleneckGroup:'Sales',bottleneckCode:'no_leads',bottleneckReason:'QA demand',bottleneckConfidence:65},answers:[{question:'Progress',answer:'Working MVP'},{question:'Bottleneck',answer:'Customer demand'},{question:'Goal',answer:'Validate demand'}]}});
    assert.equal(generated.status(),201);const newPlan=(await generated.json()).data;
    const records=Array.from({length:3},(_,i)=>({id:randomUUID(),company:'QA company '+(i+1),name:'QA person '+(i+1),date:new Date().toISOString().slice(0,10),relationship:'prospect',fit:'yes',pain:zh?'原始對話：整理報表花太多時間':'Original source: reporting takes too long',severity:'high',solution:'Spreadsheet',wtp:'considering',reason:'',missing:'',referral:''}));
    const save=await context.request.post(origin+'/api/action-plans/flow?locale='+locale,{headers:{origin},data:{action:'save',planId:newPlan.id,revision:newPlan.revision,step:'01-1',data:{kind:'conversation',market:'TW',records}}});assert.equal(save.status(),200);
    const fingerprint=async()=>JSON.stringify({actions:await db.actionItem.findMany({where:{actionPlanId:newPlan.id},orderBy:{id:'asc'}}),milestones:await db.planMilestone.findMany({where:{actionPlanId:newPlan.id},orderBy:{id:'asc'}})}),original=await fingerprint();
    for(const width of [390,768,1440]){
      await page.setViewportSize({width,height:1000});await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('[data-conversation-form]').waitFor();await closeTour(page,locale);
      check('Single-page conversation is primary '+locale+width,await page.getByLabel(w('對象姓名','Person'),{exact:true}).isVisible()&&await page.getByRole('button',{name:w('高','High'),exact:true}).isVisible());
      check('Incomplete target remains locked '+locale+width,await page.getByRole('button',{name:w('確認並完成','Confirm and complete'),exact:true}).isDisabled());
      check('Evidence and delivered-company tables precede map '+locale+width,await page.locator('#current-findings-title').count()===1&&await page.locator('#prospects').isVisible());
      await layout(page,'Target conversation '+locale+width,locale);await screenshot(page,'target-conversation-'+locale+'-'+width);
    }
    const capture=async(name,locator)=>{const file=path.join(output,name+'-'+locale+'.png');await locator.screenshot({path:file});report.screenshots.push(file);};
    await page.setViewportSize({width:1334,height:1058});await page.goto(origin+prefix+'/dashboard');await page.getByText(w('查看佐證','Review evidence'),{exact:false}).first().waitFor();await capture('reference-home',page.locator('main > div'));
    await page.setViewportSize({width:1052,height:662});await page.goto(origin+prefix+'/dashboard/matchmaking?tab=recommendations');await page.locator('#matchmaking-panel-recommendations article').first().waitFor();const matching=path.join(output,'reference-matching-'+locale+'.png');await page.screenshot({path:matching});report.screenshots.push(matching);
    await page.setViewportSize({width:1056,height:1330});await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('[data-conversation-form]').waitFor();await closeTour(page,locale);const map=page.locator('#action-map');if(await map.evaluate(e=>e.open))await map.locator(':scope > summary').click();await page.evaluate(()=>window.scrollTo(0,0));
    await page.addStyleTag({content:'*{scroll-behavior:auto!important;animation:none!important;transition:none!important}'});await page.evaluate(()=>window.scrollTo(0,0));
    await capture('reference-task',page.locator('#goal-roadmap'));
    const visibleErrors=(await page.getByRole('alert').allInnerTexts()).filter(text=>text.trim());check('Reference captures have no failed translation '+locale,visibleErrors.length===0);
    check('Rendering preserves saved steps and completion data '+locale,await fingerprint()===original);
    await context.close();
  }
}

async function homepageQA() {
  const context=await browser.newContext();contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(e.message));
  for(const locale of ['en','zh-tw'])for(const width of [390,768,1440,1920]){
    const label=locale+width;await page.setViewportSize({width,height:1000});const response=await page.goto(origin+(locale==='en'?'':'/zh-tw')+'/product');check('Home responds '+label,response.status()===200);
    await page.getByRole('heading',{level:1}).waitFor();check('Home layout '+label,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));
    check('Every landing element has square corners '+label,await page.locator('main').evaluate(root=>[root,...root.querySelectorAll('*')].every(el=>{const s=getComputedStyle(el);return [s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].every(v=>v==='0px');})));
    const hero=await page.locator('#how').evaluate(root=>{const cover=root.querySelector('article').getBoundingClientRect(),cards=[...root.querySelectorAll('a')].map(a=>a.getBoundingClientRect());return{cover:{x:cover.x,y:cover.y,width:cover.width,bottom:cover.bottom},cards:cards.map(c=>({x:c.x,y:c.y,width:c.width,bottom:c.bottom}))};});
    check('Reference hero composition '+label,hero.cards.length===5&&(width>1100?hero.cover.x<hero.cards[1].x&&Math.abs(hero.cover.y-hero.cards[1].y)<2&&hero.cards[3].y>hero.cards[1].y:width>=768?hero.cover.bottom<=hero.cards[1].y&&hero.cards[2].x>hero.cards[1].x:hero.cover.bottom<=hero.cards[1].y&&hero.cards[2].y>hero.cards[1].y));
    check('Three educational cases '+label,await page.locator('#cases article').count()===3&&await page.locator('#cases a[target="_blank"]').count()===3);
    check('Reference case numbers and order '+label,JSON.stringify(await page.locator('#cases article h3').allTextContents())===JSON.stringify(['$1.75B','15×','0'])&&JSON.stringify(await page.locator('#cases article').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))))===JSON.stringify(['Quibi','Dropbox','Zappos']));
    const names=await page.locator('#team article h3').allTextContents();check('Requested team order '+label,JSON.stringify(names)===JSON.stringify(['Vivian Lee','Eric','Vincent','Iris']));
    check('Pilot country statement '+label,(await page.locator('aside').innerText()).includes(locale==='en'?'5 countries':'5 個國家'));
    check('Confirmed event and two placeholders '+label,await page.locator('#community time[datetime="2026-11-16"]').count()===1&&await page.locator('#community').getByRole('heading',{name:locale==='en'?'Coming soon':'即將推出',exact:true}).count()===2);
    check('No invented event registration '+label,await page.locator('#community').getByRole('link',{name:/reserve|register|報名|候補/i}).count()===0);
    const body=await page.locator('body').innerText();check('Inside NOVA AI and no old operators '+label,body.includes(locale==='en'?'Inside NOVA AI':'NOVA AI 幕後')&&!/Inside ROLL ON|Built by operators|\[Photo/.test(body));
    check('Case photos match supplied companies '+label,await page.locator('#cases article').evaluateAll(nodes=>nodes.every(n=>n.querySelector('img')?.getAttribute('src')?.includes(n.getAttribute('aria-label').toLowerCase()+'.webp'))));
    for(const interval of ['month','year']){
      await page.getByRole('button',{name:interval==='month'?(locale==='en'?'Monthly':'月繳'):(locale==='en'?'Yearly':'年繳'),exact:true}).click();
      const cards=page.locator('[data-pricing-card]');
      const layout=await cards.evaluateAll(nodes=>{
        const result=nodes.map(n=>{const rect=n.getBoundingClientRect();const positions=Object.fromEntries(['amount','billing','features','action'].map(part=>{const e=n.querySelector('[data-pricing-part="'+part+'"]'),r=e.getBoundingClientRect();return[part,{top:r.top,bottom:r.bottom,height:r.height}];}));const action=n.querySelector('a'),style=getComputedStyle(action);return{key:n.getAttribute('data-pricing-card'),top:rect.top,positions,color:style.color,background:style.backgroundColor,contained:action.scrollWidth<=action.clientWidth+1};});
        const luminance=value=>{if(!value.startsWith('rgb('))return null;const channels=value.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
        return{aligned:result.every((c,i)=>result.slice(i+1).filter(other=>Math.abs(other.top-c.top)<1).every(other=>['amount','billing','features','action'].every(part=>Math.abs(c.positions[part].top-other.positions[part].top)<1&&Math.abs(c.positions.action.bottom-other.positions.action.bottom)<1))),contrast:result.every(c=>{const text=luminance(c.color),background=luminance(c.background);return text!==null&&background!==null&&(Math.max(text,background)+.05)/(Math.min(text,background)+.05)>=4.5;}),touch:result.every(c=>c.positions.action.height>=44&&c.contained)};
      });
      check('Pricing rows aligned '+label+interval,layout.aligned);check('Pricing actions readable '+label+interval,layout.contrast&&layout.touch);
      const amounts=await page.locator('[data-pricing-part="amount"]').allTextContents();check('Existing prices retained '+label+interval,amounts[0]==='USD 0'&&amounts[1]===(interval==='month'?'USD 49':'USD 39')&&amounts[2]===(interval==='month'?'USD 149':'USD 139'));
      if(interval==='year'){check('Annual totals disclosed '+label,(await page.locator('[data-pricing-card="pro"] [data-pricing-part="billing"]').innerText()).includes('USD 468')&&(await page.locator('[data-pricing-card="business"] [data-pricing-part="billing"]').innerText()).includes('USD 1,668'));}
      if(width>=1440){const file=path.join(output,'pricing-'+label+'-'+interval+'.png');await cards.first().locator('..').screenshot({path:file});report.screenshots.push(file);}
    }
    await page.getByRole('button',{name:locale==='en'?'Monthly':'月繳',exact:true}).click();
    const height=await page.evaluate(()=>document.body.scrollHeight);for(let y=0;y<height;y+=750){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(60);}await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));check('Images load '+label,true);
    await screenshot(page,'homepage-'+label);
    if(width===1440){const file=path.join(output,'cases-'+locale+'.png');await page.locator('#cases').screenshot({path:file});report.screenshots.push(file);}
  }
  await page.setViewportSize({width:390,height:1000});await page.getByRole('button',{name:'選單 +',exact:true}).click();check('Mobile menu expands',await page.getByRole('button',{name:'選單 −',exact:true}).getAttribute('aria-expanded')==='true');await page.getByRole('link',{name:'團隊',exact:true}).click();check('Mobile anchor reaches team',page.url().endsWith('#team'));
}

async function couponCodesQA() {
  const key='billing.nova60.codes';assert.equal(await db.setting.findUnique({where:{key}}),null);couponCodesOwned=true;
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
  const token=await new SignJWT({email:'qa-admin@example.invalid',role:'admin'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(authSecret));
  await context.addCookies([{name:'admin_session',value:token,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.on('pageerror',error=>report.browserErrors.push(error.message));
  await page.goto(origin+'/admin/settings');await page.getByRole('heading',{name:'11 月優惠代碼管理 · 首期 60% OFF'}).waitFor();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Coupon admin responsive '+width,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'coupons-admin-'+width);}
  await page.getByLabel('新增優惠代碼',{exact:true}).fill('event60');await page.getByRole('button',{name:'新增並啟用',exact:true}).click();await page.getByRole('status').filter({hasText:'EVENT60 已啟用'}).waitFor();
  check('Admin saves normalized code',(await db.setting.findUniqueOrThrow({where:{key}})).value.EVENT60===true);
  await page.getByRole('button',{name:'停用 EVENT60',exact:true}).click();await page.getByRole('button',{name:'啟用 EVENT60',exact:true}).waitFor();
  check('Admin disables code',(await db.setting.findUniqueOrThrow({where:{key}})).value.EVENT60===false);
  const member=await session('desktop',390);
  check('Member cannot manage codes',(await member.context.request.patch(origin+'/api/admin/billing/coupon',{headers:{origin},data:{code:'DENIED60',enabled:true}})).status()===401);
  check('Cross-origin admin write denied',(await context.request.patch(origin+'/api/admin/billing/coupon',{headers:{origin:'https://evil.example'},data:{code:'DENIED60',enabled:true}})).status()===403);
  const quote=await member.context.request.post(origin+'/api/billing/coupon',{headers:{origin},data:{code:' meettaipei60 ',interval:'month'}});
  check('Meet Taipei quote accepted',quote.status()===200);const body=await quote.json();check('Meet Taipei quote keeps code and first-period price',body.data.code==='MEETTAIPEI60'&&body.data.quotes[0].firstAmountMinor===1960);
  const denied=await member.context.request.post(origin+'/api/billing/coupon',{headers:{origin},data:{code:'EVENT60',interval:'month'}});check('Disabled code rejected',denied.status()===400);
  await page.getByRole('button',{name:'啟用 EVENT60',exact:true}).click();await page.getByRole('button',{name:'停用 EVENT60',exact:true}).waitFor();check('Admin re-enables code',(await db.setting.findUniqueOrThrow({where:{key}})).value.EVENT60===true);
}

async function commerceSettingsQA() {
  assert.equal(await db.setting.count({where:{key:{startsWith:'novaCommerce.'}}}),0,'Commerce QA requires an empty isolated policy namespace');commerceOwned=true;
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
  const token=await new SignJWT({email:'qa-admin@example.invalid',role:'admin'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(authSecret));
  await context.addCookies([{name:'admin_session',value:token,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(),other=await context.newPage();for(const target of [page,other])target.on('pageerror',error=>report.browserErrors.push(error.message));
  await page.goto(origin+'/admin/billing');await other.goto(origin+'/admin/billing');await page.getByRole('heading',{level:1,name:'價格與 Token 政策',exact:true}).waitFor();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});check('Commerce admin responsive '+width,await page.evaluate(()=>document.querySelectorAll('h1').length===1&&document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'commerce-admin-'+width);}
  await page.getByLabel('交流邀請預扣 Token',{exact:true}).fill('9');await page.getByLabel('搜尋五家公司預扣 Token',{exact:true}).fill('25');await page.getByLabel('每月方案贈額（下個 UTC 月）',{exact:true}).fill('220');await page.getByLabel('每會員每 UTC 月搜尋公司上限',{exact:true}).fill('15');
  await page.getByRole('button',{name:'新增加購包',exact:true}).click();await page.getByLabel('最終售價',{exact:true}).fill('10');
  let response=waitResponse(page,r=>r.url().endsWith('/api/admin/billing/settings')&&r.request().method()==='POST');await page.getByRole('button',{name:'儲存草稿',exact:true}).click();assert.equal((await response).status(),200);await page.getByRole('status').filter({hasText:'草稿已保存'}).waitFor();
  const member=await session('desktop',390);check('Members cannot read pricing drafts',(await member.context.request.get(origin+'/api/admin/billing/settings')).status()===401);
  let data=(await (await member.context.request.get(origin+'/api/tokens')).json()).data;check('Saved draft has no billing effect',data.pricing.inviteFee===5&&data.pricing.searchFee===20&&data.available===150);
  await other.getByLabel('每月方案贈額（下個 UTC 月）',{exact:true}).fill('333');response=waitResponse(other,r=>r.url().endsWith('/api/admin/billing/settings')&&r.request().method()==='POST');await other.getByRole('button',{name:'儲存草稿',exact:true}).click();assert.equal((await response).status(),409);await other.getByRole('alert').filter({hasText:'HTTP 409'}).waitFor();check('Stale editor keeps input',await other.getByLabel('每月方案贈額（下個 UTC 月）',{exact:true}).inputValue()==='333');
  await other.getByRole('button',{name:'讀取最新設定並保留輸入',exact:true}).click();await other.getByRole('status').filter({hasText:'已讀取最新設定'}).waitFor();await other.getByRole('button',{name:'採用伺服器草稿',exact:true}).click();check('Explicit conflict comparison adopts latest draft',await other.getByLabel('交流邀請預扣 Token',{exact:true}).inputValue()==='9');
  response=waitResponse(page,r=>r.url().endsWith('/api/admin/billing/settings')&&r.request().method()==='POST');await page.getByRole('button',{name:'發布已儲存設定',exact:true}).click();assert.equal((await response).status(),200);await page.getByRole('status').filter({hasText:'已發布第 2 版'}).waitFor();
  data=(await (await member.context.request.get(origin+'/api/tokens')).json()).data;check('Published Token quote reaches member API',data.pricing.version===2&&data.pricing.inviteFee===9&&data.pricing.searchFee===25);check('Monthly grant stays 150 with 220 scheduled',data.monthlyGrant===150&&data.pricing.nextMonthlyGrant===220&&data.available===150);
  const prospect=(await (await member.context.request.get(origin+'/api/prospects')).json()).data;check('Published search quota reaches member API',prospect.quota.limit===15&&prospect.pricing.searchFee===25);
  for(const locale of ['en','zh-tw']){const zh=locale==='zh-tw',prefix=zh?'/zh-tw':'';await member.page.goto(origin+prefix+'/product');await member.page.locator('#pricing').getByText(zh?'搜尋每 5 家 25 Token':'Search five companies for 25 Token',{exact:false}).waitFor();for(const width of [390,768,1440]){await member.page.setViewportSize({width,height:1000});check('Published public pricing '+locale+width,await member.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(member.page,'commerce-public-'+locale+'-'+width);}}
  const card=await db.matchmakingProfile.findUniqueOrThrow({where:{userId:users.newpaid.id}});await member.page.goto(origin+'/dashboard/matchmaking/'+card.id);await member.page.getByRole('button',{name:'Request to chat · hold 9 Token',exact:true}).waitFor();check('Member invitation displays published fee',true);
  await member.page.goto(origin+'/dashboard/account#plan');check('Billing page stays available after token-only policy publish',await member.page.getByRole('heading',{level:1}).count()===1);response=waitResponse(member.page,r=>r.url().endsWith('/api/billing/subscribe')&&r.request().method()==='POST');await member.page.getByTestId('subscribe-pro').click();assert.equal((await response).status(),503);await member.page.getByRole('alert').filter({hasText:'HTTP 503'}).waitFor();check('Unavailable PayPal checkout shows full HTTP error',true);
  const generated=await member.context.request.post(origin+'/api/action-plans/generate',{headers:{origin},data:{locale:'en',requestId:randomUUID(),candidateCount:5,diagnosis:{companyStage:'MVP',stageReason:'Private pricing QA',stageConfidence:70,bottleneckGroup:'Sales',bottleneckCode:'no_leads',bottleneckReason:'Verify pricing without provider calls',bottleneckConfidence:65},answers:[{question:'Progress',answer:'Private prototype'},{question:'Bottleneck',answer:'Customer research'},{question:'Goal',answer:'Verify pricing settings'}]}});assert.equal(generated.status(),201);const plan=(await generated.json()).data;users.desktop.flowActionIds=plan.actions.map(a=>a.id);await member.page.goto(origin+'/dashboard/agenda');await closeTour(member.page,'en');await openTaskTools(member.page);await member.page.locator('#prospects > summary').click();const search=member.page.getByRole('region',{name:'Find new companies',exact:true});const find=search.getByRole('button',{name:'Find 5 new companies · hold 25 Token',exact:true});await find.waitFor();check('Task search shows published fee and quota',(await search.innerText()).includes('0/15'));
  await search.getByRole('textbox',{name:'Target buyer description',exact:true}).fill('Private QA buyer criteria without supplier submission');await search.getByRole('checkbox').check();response=waitResponse(member.page,r=>r.url().endsWith('/api/prospects/orders')&&r.request().method()==='POST');await find.click();const created=await response;assert.equal(created.status(),202);check('Task search sends the published quote version',created.request().postDataJSON().pricingVersion===2);const orderId=(await created.json()).data.id,fee=await db.tokenReservation.findFirstOrThrow({where:{resourceId:orderId}}),wallet=await db.tokenWallet.findUniqueOrThrow({where:{userId:users.desktop.id}});check('Task search reserves the configured amount once',fee.amount===25&&wallet.available===125&&wallet.reserved===25);const local=await db.prospectingOrder.findUniqueOrThrow({where:{id:orderId}});check('Pricing QA never submits to the supplier',local.providerOrderId===null&&local.submittedAt===null);
  await member.page.goto(origin+'/zh-tw/dashboard/agenda');await closeTour(member.page,'zh-tw');await openTaskTools(member.page);await member.page.locator('#prospects > summary').click();const chineseSearch=member.page.getByRole('region',{name:'找新公司',exact:true});await chineseSearch.getByRole('button',{name:'搜尋 5 家新公司 · 預扣 25 Token',exact:true}).waitFor();check('Chinese task search shows published fee and quota',(await chineseSearch.innerText()).includes('0/15'));
  // Simulate a lost acknowledgement after the server saves, then retry the same request.
  await page.getByLabel('交流邀請預扣 Token',{exact:true}).fill('11');const requests=[];await page.route('**/api/admin/billing/settings',async route=>{if(route.request().method()!=='POST')return route.continue();requests.push(route.request().postDataJSON());if(requests.length===1){const saved=await route.fetch();assert.equal(saved.status(),200);await route.abort();}else await route.continue();});
  await page.getByRole('button',{name:'儲存草稿',exact:true}).click();await page.getByRole('alert').filter({hasText:'fetch'}).waitFor();check('Lost save acknowledgement keeps editor input',await page.getByLabel('交流邀請預扣 Token',{exact:true}).inputValue()==='11');response=waitResponse(page,r=>r.url().endsWith('/api/admin/billing/settings')&&r.request().method()==='POST');await page.getByRole('button',{name:'儲存草稿',exact:true}).click();assert.equal((await response).status(),200);check('Lost save retries the same request',requests.length===2&&JSON.stringify(requests[0])===JSON.stringify(requests[1]));await page.unroute('**/api/admin/billing/settings');
  await page.getByLabel('SPARK 每月（USD）',{exact:true}).fill('59');response=waitResponse(page,r=>r.url().endsWith('/api/admin/billing/settings')&&r.request().method()==='POST');await page.getByRole('button',{name:'儲存草稿',exact:true}).click();assert.equal((await response).status(),200);response=waitResponse(page,r=>r.url().endsWith('/api/admin/billing/settings')&&r.request().method()==='POST');await page.getByRole('button',{name:'發布已儲存設定',exact:true}).click();assert.equal((await response).status(),409);await page.getByRole('alert').filter({hasText:'HTTP 409'}).waitFor();check('Unprepared PayPal price cannot publish',await page.getByLabel('SPARK 每月（USD）',{exact:true}).inputValue()==='59');
  const current=(await (await context.request.get(origin+'/api/admin/billing/settings')).json()).data;check('Failed price publish preserves live price and cash off',current.live.policy.subscriptions.pro.month.amountMinor===4900&&current.live.policy.cashCheckoutEnabled===false&&current.live.policy.tokens.inviteFee===9);check('History records exact published policy',current.history.some(h=>h.version===2&&h.policy.tokens.searchFee===25));
  await context.close();await member.context.close();
}

try {
  if(['localization','layout'].includes(scenario)) await startCopyProvider();
  await startServer(); await redirects();
  if (mode === 'start') {
    if(scenario!=='homepage') await fixtures(); browser = await chromium.launch({ headless: true });
    if (scenario === 'layout') { await layoutQA(); }
    else if (scenario === 'localization') { await localizationQA(); }
    else if (scenario === 'language') { await languageQA(); }
    else if (scenario === 'legacy') { await legacyLayoutQA(); }
    else if (scenario === 'guided') { await guidedEntryQA(); }
    else if (scenario === 'homepage') { await homepageQA(); }
    else if (scenario === 'coupons') { await couponCodesQA(); }
    else if (scenario === 'commerce') { await commerceSettingsQA(); }
    else if (scenario === 'pdf') { await pdfCompletion(); }
    else if (scenario === 'tokens') { await tokenCore('newpaid', 'blocked', 1440, 'en', 'accept'); await tokenCore('complete', 'outcome', 390, 'zh-tw', 'decline'); await tokenCore('desktop', 'newpaid', 390, 'en', 'cancel'); await tokenCore('mobile', 'complete', 1440, 'zh-tw', 'expire'); await tokenAdminAndSearch(); }
    else if (scenario === 'roundtables') { await roundtableCore('investor', 'desktop', 1440, 'en', false); await roundtableCore('requester', 'mobile', 390, 'zh-tw', true); }
    else if (scenario === 'flow') { await flowCore('mobile', 390, 'zh-tw'); await flowCore('desktop', 1440, 'en'); await flowDocumentAndReview(); }
    else { await core('mobile', 390); await core('desktop', 1440); await tablet(); await states(); }
    check('No browser runtime errors', report.browserErrors.length === 0);
  }
} catch (error) {
  report.failure = error.message; console.error(error.stack); process.exitCode = 1;
  for (const context of contexts) for (const page of context.pages()) { try { await screenshot(page, 'failure-' + report.screenshots.length); } catch {} }
} finally {
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser?.close();
  try {
    if (created.length) {
      if (createdRoundtables.length) await db.roundtable.deleteMany({ where: { id: { in: createdRoundtables }, hostId: { in: created.map(u => u.id) } } });
      const removed = await db.user.deleteMany({ where: { id: { in: created.map(u => u.id) }, email: { in: created.map(u => u.email) } } });
      assert.equal(removed.count, created.length, 'Every owned fixture must be cleaned up.');
      await db.rateCounter.deleteMany({ where: { OR: [{key:'newsletter-ip:'+createHash('sha256').update(testIp).digest('hex')},...newsletterEmails.map(email=>({key:'newsletter-email:'+createHash('sha256').update(email).digest('hex')})),{ key: `login-ip:${testIp}` }, ...created.flatMap(u => [{ key: { contains: u.id } }, { key: { contains: u.email } }]), ...Object.values(users).flatMap(u => (u.flowActionIds || []).map(id => ({ key: { contains: id } })))] } });
      report.cleanup = { createdUsers: created.length, removedUsers: removed.count, credentialsPersisted: false };
    }
  } catch (error) { report.cleanup = { failed: true }; console.error(error.message); process.exitCode = 1; }
  if (couponCodesOwned) await db.setting.deleteMany({where:{key:'billing.nova60.codes'}});
  if (commerceOwned) await db.setting.deleteMany({where:{key:{startsWith:'novaCommerce.'}}});
  await db.$disconnect();
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
  if(copyProvider) await new Promise(resolve=>copyProvider.close(resolve));
  serverLog.end();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output, cleanup: report.cleanup }));
}
