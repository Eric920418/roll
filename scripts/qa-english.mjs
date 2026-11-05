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

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
assert(connectionString, 'Set ROLL_REWARDS_TEST_DATABASE_URL to an isolated QA database.');
const database = new URL(connectionString);
assert(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) && database.pathname.startsWith('/roll_rewards_qa'), 'English QA only accepts an isolated loopback roll_rewards_qa database.');
const mode = process.argv[2] || 'start';
assert(['start', 'dev'].includes(mode), 'Use pnpm test:english [start|dev].');
const require = createRequire(import.meta.url);
const { default: { chromium } } = await import(pathToFileURL(require.resolve('playwright')).href);
const output = process.env.NOVA_QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'nova-english-'));
fs.mkdirSync(output, { recursive: true });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
// Next treats a rewrite to a different host as an external request; use one host for both sides.
const hostname = 'localhost', port = 3116, origin = `http://${hostname}:${port}`;
const report = { mode, checks: [], screenshots: [], browserErrors: [], cleanup: null };
const users = {}, created = [], contexts = [];
const password = randomBytes(24).toString('base64url');
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
      env: { ...process.env, DATABASE_URL: connectionString, ROLL_LOCAL_POSTGRES: 'true', AUTH_SECRET: randomBytes(32).toString('hex'), NEXT_PUBLIC_APP_URL: origin, MEMBER_NETWORK_ENABLED: 'true', MEMBER_NETWORK_EMAIL_ENABLED: 'false', ANTHROPIC_API_KEY: 'qa-disabled', ANTHROPIC_BASE_URL: 'http://127.0.0.1:1', RESEND_API_KEY: '', OMRADE_API_KEY: '', PAYPAL_CLIENT_SECRET: '' },
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

try {
  await startServer(); await redirects();
  if (mode === 'start') {
    await fixtures(); browser = await chromium.launch({ headless: true });
    await core('mobile', 390); await core('desktop', 1440); await tablet(); await states();
    check('No browser runtime errors', report.browserErrors.length === 0);
  }
} catch (error) {
  report.failure = error.message; console.error(error.stack); process.exitCode = 1;
} finally {
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser?.close();
  try {
    if (created.length) {
      const removed = await db.user.deleteMany({ where: { id: { in: created.map(u => u.id) }, email: { in: created.map(u => u.email) } } });
      assert.equal(removed.count, created.length, 'Every owned fixture must be cleaned up.');
      await db.rateCounter.deleteMany({ where: { OR: [{ key: `login-ip:${testIp}` }, ...created.flatMap(u => [{ key: { contains: u.id } }, { key: { contains: u.email } }])] } });
      report.cleanup = { createdUsers: created.length, removedUsers: removed.count, credentialsPersisted: false };
    }
  } catch (error) { report.cleanup = { failed: true }; console.error(error.message); process.exitCode = 1; }
  await db.$disconnect();
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
  serverLog.end();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, output, cleanup: report.cleanup }));
}
