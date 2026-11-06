import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
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
assert(['start', 'dev', 'flow', 'roundtables', 'tokens', 'pdf'].includes(scenario), 'Use pnpm test:english [start|dev|flow|roundtables].');
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
let server, browser;
const serverLog = fs.createWriteStream(path.join(output, 'server.log'));
const check = (name, value) => { assert(value, name); report.checks.push(name); console.log(`PASS ${name}`); };

async function startServer() {
  await new Promise((resolve, reject) => {
    let startup = '';
    const timer = setTimeout(() => reject(new Error('QA server startup timed out.')), 60000);
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), mode, '--hostname', hostname, '--port', String(port)], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: connectionString, ROLL_LOCAL_POSTGRES: 'true', AUTH_SECRET: authSecret, NEXT_PUBLIC_APP_URL: origin, MEMBER_NETWORK_ENABLED: 'true', MEMBER_NETWORK_EMAIL_ENABLED: 'false', ANTHROPIC_API_KEY: 'qa-disabled', ANTHROPIC_BASE_URL: 'http://127.0.0.1:1', RESEND_API_KEY: '', OMRADE_API_KEY: scenario === 'tokens' ? 'qa-disabled' : '', OMRADE_ENABLED: scenario === 'tokens' ? 'true' : 'false', OMRADE_WORKER_ENABLED: scenario === 'tokens' ? 'true' : 'false', PAYPAL_CLIENT_SECRET: '', INVESTOR_BLOB_READ_WRITE_TOKEN: '' },
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

async function layout(page, name) {
  await page.locator('h1').waitFor();
  const value = await page.evaluate(() => ({ headings: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > innerWidth + 1, language: document.documentElement.lang }));
  check(`${name}: one H1, English document, no horizontal overflow`, value.headings === 1 && !value.overflow && value.language === 'en');
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
  const completed = waitResponse(page, r => r.request().method() === 'PATCH' && r.url().endsWith(`/actions/${users[key].actionId}`));
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
    const response = waitResponse(page, r => r.request().method() === 'POST' && r.url().includes('/api/action-plans/flow'));
    await page.getByRole('button', { name: label, exact: true }).click();
    return (await response).status();
  }
  async function saved() { check('Save current step ' + width, await postClick(saveLabel) === 200); await page.getByRole('button', { name: saveLabel, exact: true }).waitFor({ state: 'visible' }); }
  async function completed(title) {
    await page.waitForFunction(name => [...document.querySelectorAll('button')].some(b => b.textContent === name && !b.disabled), completeLabel);
    check('Complete current step ' + width, await postClick(completeLabel) === 200);
    await article.getByRole('heading', { name: title, exact: true }).waitFor();
    check('Only current-step work form remains '+width,await article.locator(':scope > fieldset').count()===1);
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
    await row.getByRole('button', { name: w('顯示完整表單', 'Show complete form'), exact: true }).click();
    await row.getByLabel(w('你與對方的關係', 'Your relationship'), { exact: true }).selectOption('prospect');
    await row.getByLabel(w('是否符合目標客群', 'Target customer fit'), { exact: true }).selectOption('yes');
    for (const [label, value] of [[w('公司', 'Company'), 'Flow company ' + i], [w('對象姓名', 'Person'), 'Person ' + i], [w('對話日期', 'Conversation date'), date], [w('痛點與原話', 'Pain and customer wording'), 'Manual reporting'], [w('目前的解決方式', 'Current solution'), 'Spreadsheets']]) await row.getByLabel(label, { exact: true }).fill(value);
    await row.getByLabel(w('痛點嚴重程度', 'Pain severity'), { exact: true }).selectOption('high');
    await row.getByLabel(w('付費意願', 'Willingness to pay'), { exact: true }).selectOption('willing');
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
  await completed(w('寫出一句話定位，並請 5 位受訪者確認', 'Write a positioning statement and confirm it with five interviewees'));
  await article.getByLabel(w('一句話定位', 'Positioning statement'), { exact: true }).fill('We help founders replace manual reporting with reliable customer evidence.');
  await article.getByRole('checkbox', { name: w('我已核對並確認這一項', 'I reviewed and confirm this item'), exact: true }).check();
  await saved(); check('Owner cannot claim five replies ' + width, await page.getByRole('button', { name: completeLabel, exact: true }).isDisabled());
  const anonymous = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': testIp } }); contexts.push(anonymous);
  const confirmationLinks = new Set();
  for (let i = 0; i < 5; i++) {
    await article.getByLabel(w('選擇受訪者', 'Choose an interviewee'), { exact: true }).selectOption({ index: i + 1 });
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
  const historyResponse = waitResponse(page, r => r.request().method() === 'GET' && r.url().includes('planId=' + oldPlan));
  await history.getByRole('button').nth(1).click(); await historyResponse;
  const goalHeader = page.locator('header[data-next-step="goal"]');
  await goalHeader.getByText('NOVA · ' + w('歷史計畫', 'ARCHIVED PLAN'), { exact: true }).waitFor();
  check('Archived plan shows its actual task count ' + width, !(await goalHeader.innerText()).includes('16') && (await goalHeader.innerText()).includes('/ ' + JSON.parse(before).length));
  const activeResponse = waitResponse(page, r => r.request().method() === 'GET' && r.url().includes('planId=' + plan.id));
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
  await sender.page.getByText(/Token (可用|available) 150/, { exact: false }).waitFor();
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
  await sender.page.getByText(/Token (可用|available) (145|150)/, { exact: false }).waitFor();
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
    check('Public real offer '+locale+width,!/80% off|15 qualified|Nov 16|\[Photo/.test(await publicPage.locator('body').innerText()));
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
    await page.goto(origin+prefix+'/dashboard/matchmaking?tab=messages');await page.locator('summary').filter({hasText:w('任務、圓桌與交流 Email 提醒','Task, roundtable and connection emails')}).click();
    const pref=page.locator('details').filter({has:page.getByRole('button',{name:w('儲存通知偏好','Save email preferences'),exact:true})});
    check('Email categories default off '+locale,await pref.getByRole('checkbox').evaluateAll(nodes=>nodes.every(n=>!n.checked)));
    await pref.getByRole('checkbox').first().check();response=waitResponse(page,r=>r.url().endsWith('/api/evidence')&&r.request().method()==='POST');await pref.getByRole('button',{name:w('儲存通知偏好','Save email preferences'),exact:true}).click();assert.equal((await response).status(),200);
    const diagnosis={companyStage:'MVP',stageReason:'Owned QA evidence',stageConfidence:70,bottleneckGroup:'Sales',bottleneckCode:'no_leads',bottleneckReason:'Find real customers',bottleneckConfidence:65};
    const generated=await context.request.post(origin+'/api/action-plans/generate',{headers:{origin},data:{locale,requestId:randomUUID(),candidateCount:5,diagnosis,answers:[{question:'Progress',answer:'Working MVP'},{question:'Bottleneck',answer:'Unverified customer demand'},{question:'Goal',answer:'Verify demand'}]}});assert.equal(generated.status(),201);const plan=(await generated.json()).data;users[key].flowActionIds=plan.actions.map(a=>a.id);
    await page.goto(origin+prefix+'/dashboard/agenda');await page.locator('article[data-next-step="record"]').waitFor();await closeTour(page,locale);
    await page.locator('summary').filter({hasText:w('語音／逐字稿與 AI 草稿協助','Speech, transcript and AI drafting')}).click();const transcript=page.getByRole('textbox',{name:w('貼上會議紀錄或逐字稿','Paste meeting notes or a transcript'),exact:true});await transcript.fill('Existing transcript');
    const speechStart=page.getByRole('button',{name:w('開始語音轉寫','Start speech transcription'),exact:true}),speechCancel=page.getByRole('button',{name:w('取消啟動','Cancel speech start'),exact:true});
    await speechStart.click();check('Speech waits for actual start '+locale,await speechCancel.isVisible()&&await page.getByRole('status').filter({hasText:w('正在啟動語音辨識','Starting speech recognition')}).isVisible());
    await speechCancel.click();check('Pending speech can cancel without losing draft '+locale,await speechStart.isVisible()&&await transcript.inputValue()==='Existing transcript'&&await page.evaluate(()=>window.qaSpeech.aborted&&window.qaSpeech.onstart===null&&window.qaSpeech.onresult===null));
    await speechStart.click();await page.getByRole('alert').filter({hasText:'start-timeout'}).waitFor({timeout:25000});check('Speech start timeout restores retry '+locale,await speechStart.isVisible()&&await transcript.inputValue()==='Existing transcript');
    await speechStart.click();await page.evaluate(()=>{window.qaSpeech.onstart();window.qaSpeech.onend();});await page.getByRole('alert').filter({hasText:'no-result'}).waitFor();check('Silent speech end gives actionable feedback '+locale,await speechStart.isVisible()&&await transcript.inputValue()==='Existing transcript');
    await speechStart.click();await page.evaluate(()=>window.qaSpeech.onstart());const speechStop=page.getByRole('button',{name:w('停止收音','Stop listening'),exact:true});await speechStop.waitFor();check('Speech shows listening only after start '+locale,await speechStop.isVisible());await page.evaluate(()=>{window.qaSpeech.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'Spoken words'}}]});window.qaSpeech.abort=()=>{throw Error('QA already stopped');};window.qaSpeech.onerror({error:'not-allowed',message:'QA permission declined'});});await page.getByRole('alert').filter({hasText:'not-allowed · QA permission declined'}).waitFor();check('Speech failure restores retry even if abort throws '+locale,await speechStart.isVisible());
    await page.waitForFunction(()=>[...document.querySelectorAll('textarea')].some(e=>e.value.includes('Spoken words')));check('Speech result and failure retain text '+locale,(await transcript.inputValue()).includes('Spoken words'));await page.reload();await page.locator('summary').filter({hasText:w('語音／逐字稿與 AI 草稿協助','Speech, transcript and AI drafting')}).click();check('Transcript draft survives navigation '+locale,(await transcript.inputValue()).includes('Spoken words'));
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

try {
  await startServer(); await redirects();
  if (mode === 'start') {
    await fixtures(); browser = await chromium.launch({ headless: true });
    if (scenario === 'pdf') { await pdfCompletion(); }
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
  await db.$disconnect();
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
  serverLog.end();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output, cleanup: report.cleanup }));
}
