import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
assert(connectionString, 'Set ROLL_REWARDS_TEST_DATABASE_URL to an isolated QA database.');
const database = new URL(connectionString);
assert(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) && database.pathname.startsWith('/roll_rewards_qa'), 'English QA only accepts an isolated loopback roll_rewards_qa database.');
const scenario = process.argv[2] || 'start';
const mode = scenario === 'dev' ? 'dev' : 'start';
assert(['start', 'dev', 'flow'].includes(scenario), 'Use pnpm test:english [start|dev|flow].');
const require = createRequire(import.meta.url);
const { default: { chromium } } = await import(pathToFileURL(require.resolve('playwright')).href);
const output = process.env.NOVA_QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'nova-english-'));
fs.mkdirSync(output, { recursive: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
// Next treats a rewrite to a different host as an external request; use one host for both sides.
const hostname = 'localhost', port = 3116, origin = `http://${hostname}:${port}`;
const report = { mode, scenario, checks: [], screenshots: [], browserErrors: [], cleanup: null };
const users = {}, created = [], contexts = [];
const password = randomBytes(24).toString('base64url'), authSecret = randomBytes(32).toString('hex');
const suffix = randomUUID(), testIp = `192.0.2.${1 + randomBytes(1)[0] % 253}`;
let server, browser;
const serverLog = fs.createWriteStream(path.join(output, 'server.log'));
const check = (name, value) => { assert(value, name); report.checks.push(name); console.log(`PASS ${name}`); };

async function startServer() {
  await new Promise((resolve, reject) => {
    let startup = '';
    const timer = setTimeout(() => reject(new Error('QA server startup timed out.')), 60000);
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, '--hostname', hostname, '--port', String(port)], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: connectionString, ROLL_LOCAL_POSTGRES: 'true', AUTH_SECRET: authSecret, NEXT_PUBLIC_APP_URL: origin, MEMBER_NETWORK_ENABLED: 'true', MEMBER_NETWORK_EMAIL_ENABLED: 'false', ANTHROPIC_API_KEY: 'qa-disabled', ANTHROPIC_BASE_URL: 'http://127.0.0.1:1', RESEND_API_KEY: '', OMRADE_API_KEY: '', PAYPAL_CLIENT_SECRET: '', INVESTOR_BLOB_READ_WRITE_TOKEN: '' },
    });
    server.stdout.on('data', chunk => { serverLog.write(chunk); startup += chunk; if (startup.includes('Ready in')) { clearTimeout(timer); resolve(); } });
    server.stderr.on('data', chunk => serverLog.write(chunk));
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`QA server exited during startup (${code}). See server.log.`)); });
  });
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

async function layout(page, name) {
  await page.locator('h1').waitFor();
  const value = await page.evaluate(() => ({ headings: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > innerWidth + 1, language: document.documentElement.lang }));
  check(`${name}: one H1, English document, no horizontal overflow`, value.headings === 1 && !value.overflow && value.language === 'en');
}
async function screenshot(page, name) {
  const file = path.join(output, `${mode}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file);
}
async function closeTour(page) {
  const skip = page.getByRole('button', { name: 'Skip tour', exact: true });
  try { await skip.waitFor({ state: 'visible', timeout: 3000 }); await skip.click(); await skip.waitFor({ state: 'hidden' }); }
  catch (error) { if (await skip.isVisible()) throw error; }
}
async function saveResponse(page, action) {
  const response = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/actions/${action}`));
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
  check(`English map uses actual singular milestone ${width}`, (await page.locator('#action-map > summary').innerText()).includes('1 milestone ·'));
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
  const completed = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/actions/${users[key].actionId}`));
  await complete.click(); check(`Task completes through real API ${width}`, (await completed).status() === 200);
  await page.getByText('QA analysis unavailable; your saved records are retained.', { exact: false }).first().waitFor();
  check(`Analysis error has HTTP/code/trace ${width}`, (await page.getByRole('alert').allInnerTexts()).some(t => t.includes('502') && t.includes('qa_analysis_unavailable') && t.includes('qa-safe-trace')));
  await page.goto(`${origin}/dashboard/matchmaking?tab=all`);
  await page.getByRole('search').waitFor(); await layout(page, `Members ${width}`);
  check(`Four English tabs ${width}`, await page.getByRole('tab').count() === 4);
  await page.getByRole('button', { name: 'Investor', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search public company cards' }).fill('QA investor');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('#matchmaking-panel-all article').filter({ hasText: 'QA investor' }).waitFor();
  check(`Role and text filters ${width}`, await page.locator('#matchmaking-panel-all article').count() === 1);
  await page.getByRole('tab', { name: 'Roundtables', exact: true }).click();
  check(`Roundtables is honest preparation ${width}`, await page.getByText('In preparation', { exact: true }).isVisible() && await page.locator('#matchmaking-panel-roundtables button').count() === 0);
  await screenshot(page, `matchmaking-${width}`);
  await page.goto(`${origin}/dashboard/messages?connection=${users[key].connectionId}`);
  await page.waitForURL(/tab=messages/); await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  check(`Legacy English message link keeps connection ${width}`, new URL(page.url()).searchParams.get('connection') === users[key].connectionId);
  await layout(page, `Inbox ${width}`);
  await page.getByRole('tab', { name: /^Messages/ }).getByLabel('1 unread messages', { exact: true }).waitFor();
  check(`Unread badge matches saved message ${width}`, true);
  const read = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/connections/${users[key].connectionId}`));
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
  let shared = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(shareUrl));
  await page.getByRole('button', { name: 'Confirm sharing consent', exact: true }).click();
  check(`Explicit private sharing saves ${width}`, (await shared).status() === 200);
  await page.getByRole('button', { name: 'Revoke all my sharing with this member', exact: true }).waitFor();
  check(`Only consented section is shared ${width}`, (await db.networkShare.findFirst({ where: { connectionId: users[key].connectionId, ownerId: users[key].id } })).sections.join() === 'profile');
  shared = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(shareUrl));
  await page.getByRole('button', { name: 'Revoke all my sharing with this member', exact: true }).click();
  check(`Private sharing revokes ${width}`, (await shared).status() === 200);
  await page.getByRole('button', { name: 'Revoke all my sharing with this member', exact: true }).waitFor({ state: 'hidden' });
  await page.goto(`${origin}/dashboard/matchmaking?tab=messages&connection=${users[key].invitationId}`);
  const reply = width === 390 ? 'accept' : 'decline';
  const invitation = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/connections/${users[key].invitationId}`));
  await page.getByRole('button', { name: reply, exact: true }).click();
  check(`Invitation ${reply} ${width}`, (await invitation).status() === 200 && (await db.networkConnection.findUnique({ where: { id: users[key].invitationId } })).status === (reply === 'accept' ? 'accepted' : 'declined'));
  await page.getByRole('button', { name: reply, exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /^QA investor ·/ }).click();
  const blocked = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/connections/${users[key].connectionId}`));
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
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/api/action-plans/flow'));
    await page.getByRole('button', { name: label, exact: true }).click();
    return (await response).status();
  }
  async function saved() { check('Save current step ' + width, await postClick(saveLabel) === 200); await page.getByRole('button', { name: saveLabel, exact: true }).waitFor({ state: 'visible' }); }
  async function completed(title) {
    await page.waitForFunction(name => [...document.querySelectorAll('button')].some(b => b.textContent === name && !b.disabled), completeLabel);
    check('Complete current step ' + width, await postClick(completeLabel) === 200);
    await article.getByRole('heading', { name: title, exact: true }).waitFor();
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
  check('Initial goal expands map ' + width, await page.locator('#action-map').evaluate(e => e.open));
  check('Only one actionable map step ' + width, await page.locator('#action-map button').count() === 1);
  await page.locator('#action-map > summary').click();
  await article.getByLabel(w('目標市場／國家', 'Target market / country'), { exact: true }).fill('TW');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (let i = 0; i < 10; i++) {
    await article.getByRole('button', { name: w('＋ 記錄客戶對話', '＋ Record a conversation'), exact: true }).click();
    const row = article.locator('details[open]');
    for (const [label, value] of [[w('公司', 'Company'), 'Flow company ' + i], [w('對象姓名', 'Person'), 'Person ' + i], [w('你與對方的關係', 'Your relationship'), 'Prospect'], [w('對話日期', 'Conversation date'), date], [w('痛點與原話', 'Pain and customer wording'), 'Manual reporting'], [w('目前的解決方式', 'Current solution'), 'Spreadsheets']]) await row.getByLabel(label, { exact: true }).fill(value);
    await row.getByLabel(w('痛點嚴重程度', 'Pain severity'), { exact: true }).selectOption('high');
    await row.getByLabel(w('付費意願', 'Willingness to pay'), { exact: true }).selectOption('willing');
    if (i === 8) { await saved(); check('Nine conversations cannot complete ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled()); }
  }
  await db.actionPlan.update({ where: { id: plan.id }, data: { revision: { increment: 1 } } });
  check('New workflow CAS returns 409 ' + width, await postClick(saveLabel) === 409);
  const delayedGet = '**/api/action-plans/flow?*';
  await page.route(delayedGet, async route => { if (route.request().method() === 'GET') await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); });
  const comparison = page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('/api/action-plans/flow'));
  await page.getByRole('button', { name: w('比較最新版本並保留草稿', 'Compare latest version and keep draft'), exact: true }).click();
  check('Conflict reload locks save until latest revision ' + width, await page.getByRole('button', { name: saveLabel, exact: true }).isDisabled());
  await comparison; await page.unroute(delayedGet);

  check('Conflict keeps tenth conversation ' + width, await article.getByLabel(w('對象姓名', 'Person'), { exact: true }).last().inputValue() === 'Person 9');
  await saved(); await page.reload(); await article.getByRole('heading', { name: w('與 10 位目標客戶對話，確認痛點與付費意願', 'Talk with 10 target customers about pain and willingness to pay'), exact: true }).waitFor();
  check('Goal expansion is shown once ' + width, !await page.locator('#action-map').evaluate(e => e.open));
  await screenshot(page, 'flow-conversation-' + locale + '-' + width);
  await completed(w('寫出一句話定位，並請 5 位受訪者確認', 'Write a positioning statement and confirm it with five interviewees'));
  await article.getByLabel(w('一句話定位', 'Positioning statement'), { exact: true }).fill('We help founders replace manual reporting with reliable customer evidence.');
  await article.getByRole('checkbox', { name: w('我已核對並確認這一項', 'I reviewed and confirm this item'), exact: true }).check();
  await saved(); check('Owner cannot claim five replies ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled());
  const anonymous = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': testIp } }); contexts.push(anonymous);
  for (let i = 0; i < 5; i++) {
    await article.getByLabel(w('選擇受訪者', 'Choose an interviewee'), { exact: true }).selectOption({ index: i + 1 });
    check('Generate private confirmation link ' + width, await postClick(w('建立確認連結', 'Create confirmation link')) === 200);
    const link = await page.getByLabel(w('專屬連結（可複製）', 'Dedicated link (copy to share)'), { exact: true }).inputValue();
    const url = new URL(link), id = url.pathname.split('/').at(-1);
    if (i === 0) {
      const recipient = await anonymous.newPage(); await recipient.goto(link);
      await recipient.getByRole('button', { name: w('符合，這就是我的情況', 'Yes, this describes my situation'), exact: true }).click();
      await recipient.getByRole('status').waitFor(); await screenshot(recipient, 'flow-confirmation-' + locale + '-' + width); await recipient.close();
    } else check('Anonymous interviewee response ' + width, (await anonymous.request.post(origin + '/api/action-plans/confirm/' + id, { headers: { origin }, data: { token: url.searchParams.get('token'), answer: 'yes' } })).status() === 200);
    await article.getByRole('button', { name: w('更新回覆', 'Refresh responses'), exact: true }).click();
    await page.waitForTimeout(150);
  }
  await anonymous.close();
  await completed(w('建立潛在客戶評分標準', 'Define lead qualification criteria'));
  for (const checkbox of await article.getByRole('checkbox', { name: w('確認條件與權重', 'Confirm criterion and weight'), exact: true }).all()) await checkbox.check();
  await saved(); await screenshot(page, 'flow-organize-' + locale + '-' + width);
  await completed(w('將已對話的客戶分級', 'Score and tier your interviewees'));
  const tierCards = article.locator('fieldset > section');
  for (let i = 0; i < await tierCards.count(); i++) {
    const checks = tierCards.nth(i).getByRole('checkbox');
    if (i < 3) for (let n = 0; n < 4; n++) await checks.nth(n).check();
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
    await row.getByLabel(w('管道', 'Channel'), { exact: true }).fill('Email');
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
  const history = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: w('計畫歷史與新計畫', 'Plan history and a new plan') }) });
  await history.locator('summary').click();
  const historyResponse = page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('planId=' + oldPlan));
  await history.getByRole('button').nth(1).click(); await historyResponse;
  const goalHeader = page.locator('header[data-next-step="goal"]');
  await goalHeader.getByText('NOVA · ' + w('歷史計畫', 'ARCHIVED PLAN'), { exact: true }).waitFor();
  check('Archived plan shows its actual task count ' + width, !(await goalHeader.innerText()).includes('16') && (await goalHeader.innerText()).includes('/ ' + JSON.parse(before).length));
  const activeResponse = page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('planId=' + plan.id));
  await page.getByRole('button', { name: w('回到目前計畫', 'Return to the active plan'), exact: true }).click(); await activeResponse;
  await page.getByRole('heading', { name: w('取得付款或簽約證據', 'Obtain payment or signed contract evidence'), exact: true }).waitFor();
  check('Return from history preserves the active step ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled());
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
  check('Document chapters use canonical ID order', (await page.locator('main > section h2').allInnerTexts()).join('|') === 'Lead sources|Outreach message|Conversation script|Closing steps');
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
  let decision = review.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/api/admin/task-evidence'));
  await review.getByRole('button', { name: '核對通過', exact: true }).click();
  check('Missing private storage cannot approve proof', (await decision).status() === 503);
  await review.getByRole('alert').filter({ hasText: 'HTTP 503' }).waitFor();
  check('Review error keeps reason and HTTP status', (await review.getByRole('alert').filter({ hasText: 'HTTP 503' }).innerText()).includes('503') && (await review.getByLabel('本次核對理由', { exact: true }).inputValue()).includes('QA fixture'));
  decision = review.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/api/admin/task-evidence'));
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

try {
  await startServer(); await redirects();
  if (mode === 'start') {
    await fixtures(); browser = await chromium.launch({ headless: true });
    if (scenario === 'flow') { await flowCore('mobile', 390, 'zh-tw'); await flowCore('desktop', 1440, 'en'); await flowDocumentAndReview(); }
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
      const removed = await db.user.deleteMany({ where: { id: { in: created.map(u => u.id) }, email: { in: created.map(u => u.email) } } });
      assert.equal(removed.count, created.length, 'Every owned fixture must be cleaned up.');
      await db.rateCounter.deleteMany({ where: { OR: [{ key: `login-ip:${testIp}` }, ...created.flatMap(u => [{ key: { contains: u.id } }, { key: { contains: u.email } }]), ...Object.values(users).flatMap(u => (u.flowActionIds || []).map(id => ({ key: { contains: id } })))] } });
      report.cleanup = { createdUsers: created.length, removedUsers: removed.count, credentialsPersisted: false };
    }
  } catch (error) { report.cleanup = { failed: true }; console.error(error.message); process.exitCode = 1; }
  await db.$disconnect();
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
  serverLog.end();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output, cleanup: report.cleanup }));
}
