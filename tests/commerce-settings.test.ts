import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { commercePolicySchema, regularPlanBody, assertRegularPlan, defaultCommercePolicy, commercePrefix } from '../src/lib/billing/commerce-policy';
import { pdfRuntime } from './helpers/pdf-runtime';

test('Commerce policy rejects invalid money, unbounded quotas and premature cash activation', () => {
  const policy = defaultCommercePolicy();
  assert(commercePolicySchema.safeParse(policy).success);
  for (const tokens of [{ ...policy.tokens, inviteFee: 0 }, { ...policy.tokens, searchFee: -1 }, { ...policy.tokens, monthlyCompanies: 6 }, { ...policy.tokens, monthlyGrant: 0.5 }, { ...policy.tokens, dailyInvites: 10000000 }]) assert(!commercePolicySchema.safeParse({ ...policy, tokens }).success);
  assert(!commercePolicySchema.safeParse({ ...policy, cashCheckoutEnabled: true }).success);
  assert(!commercePolicySchema.safeParse({ ...policy, subscriptions: { ...policy.subscriptions, pro: { ...policy.subscriptions.pro, month: { amountMinor: 1999.1, paypalPlanId: '' } } } }).success);
  const pack = { id: 'p1', amountMinor: 1000, tokens: 100, currency: 'USD' };
  assert(commercePolicySchema.safeParse({ ...policy, packs: [pack] }).success);
  assert(!commercePolicySchema.safeParse({ ...policy, packs: [pack, pack] }).success);
  const remote = regularPlanBody('PRODUCT', 'pro', 'month', 1999);
  assert.equal(assertRegularPlan(remote, 'pro', 'month', 1999), 'PRODUCT');
  for (const raw of [{ ...remote, status: 'INACTIVE' }, { ...remote, quantity_supported: true }, { ...remote, taxes: { percentage: '5' } }, { ...remote, payment_preferences: { setup_fee: { value: '1' } } }, { ...remote, billing_cycles: [...remote.billing_cycles, ...remote.billing_cycles] }]) assert.throws(() => assertRegularPlan(raw, 'pro', 'month', 1999));
  assert.throws(() => assertRegularPlan(remote, 'pro', 'year', 1999));
});

test('Versioned commerce in isolated PostgreSQL: unchanged defaults, draft/publish, old holds, future grants, checkout and history', { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/roll_rewards_qa'));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) }), ids: string[] = [];
  assert.equal(await db.setting.count({ where: { key: { startsWith: commercePrefix } } }), 0, 'Use an isolated database without existing commerce settings');
  let sessionUser = '', subscriptionsCreated = 0;
  const remoteSubscriptions = new Map<string, { id: string; status: string; plan_id: string; links: { rel: string; href: string }[] }>(), rateLimits: Array<{ key: string; max: number }> = [];
  let admin = false, clock = Date.parse('2026-11-07T04:00:00Z'), planCreates = 0;
  class Clock extends Date { constructor(value?: string | number | Date) { super(value === undefined ? clock : value instanceof Date ? value.getTime() : value); } static now() { return clock; } }
  class MemberError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const env = { PAYPAL_ENV: 'sandbox', PAYPAL_CLIENT_ID: 'qa-disabled', PAYPAL_CLIENT_SECRET: 'qa-disabled', NEXT_PUBLIC_APP_URL: 'https://nova.test', MEMBER_NETWORK_ENABLED: 'true', PAYPAL_PLAN_ID_PRO_MONTHLY_USD: 'P-PROMONTH', PAYPAL_PLAN_ID_PRO_YEARLY_USD: 'P-PROYEAR', PAYPAL_PLAN_ID_BUSINESS_MONTHLY_USD: 'P-NOVAMONTH', PAYPAL_PLAN_ID_BUSINESS_YEARLY_USD: 'P-NOVAYEAR' };
  const remote = new Map<string, unknown>();
  for (const [plan, interval, amount, id] of [['pro', 'month', 4900, env.PAYPAL_PLAN_ID_PRO_MONTHLY_USD], ['pro', 'year', 46800, env.PAYPAL_PLAN_ID_PRO_YEARLY_USD], ['business', 'month', 14900, env.PAYPAL_PLAN_ID_BUSINESS_MONTHLY_USD], ['business', 'year', 166800, env.PAYPAL_PLAN_ID_BUSINESS_YEARLY_USD]] as const) remote.set(id, regularPlanBody('QA-PRODUCT', plan, interval, amount));
  const mocks: Record<string, unknown> = {
    'server-only': {}, '@/lib/prisma': { prisma: db },
    '@/lib/auth/guard': { requireAdmin: async () => admin ? { email: 'qa-admin@example.invalid' } : null, getUserSession: async () => sessionUser ? { uid: sessionUser, email: 'qa-buyer@example.invalid' } : null },
    '@/lib/member-http': { MemberError, privateOk: (data: unknown) => Response.json({ data }), memberError: (e: Error & { status?: number; issues?: unknown }) => Response.json({ error: e.message }, { status: e.status || (e.issues ? 400 : 500) }) },
    '@/lib/api': { ok: (data: unknown) => Response.json({ data }), fail: (error: string, status = 400) => Response.json({ error }, { status }), unauthorized: () => Response.json({}, { status: 401 }), failFromError: () => Response.json({}, { status: 500 }) },
    '@/lib/rate-limit': { MINUTE_MS: 60000, HOUR_MS: 3600000, DAY_MS: 86400000, checkRateLimit: async (key: string, max: number) => { rateLimits.push({ key, max }); return { ok: true }; } },
    '@/lib/auth/account': { getBetaAccess: async () => false, getCurrentAccount: async () => sessionUser ? { ...(await db.user.findUniqueOrThrow({ where: { id: sessionUser } })), betaAccess: false } : null },
    '@/lib/network/access': { networkAccount: async (userId: string) => ({ ...(await db.user.findUniqueOrThrow({ where: { id: userId } })), effectivePlan: 'business', verifiedInvestor: false }), features: async () => ({ prospects: true }), requireNetwork: async () => {}, activeShare: async () => null },
    '@/lib/prospecting/client': { configured: () => true },
    '@/lib/cms/rollon-v10': { isRollonPage: () => false, validateRollonAssets: () => [] }, '@/lib/cms/revalidate': { revalidateContent() {} }, '@/lib/cms/tags': { SETTINGS_TAG: 'settings' },
    '@/lib/billing/paypal': { isPaypalConfigured: () => true, createSubscription: async (input: { planId: string }) => { const id = 'I-QA' + randomUUID(); subscriptionsCreated++; remoteSubscriptions.set(id, { id, status: 'APPROVAL_PENDING', plan_id: input.planId, links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approve?token=' + id }] }); return { ...remoteSubscriptions.get(id), approveUrl: 'https://www.sandbox.paypal.com/approve?token=' + id }; }, getSubscription: async (id: string) => remoteSubscriptions.get(id), getBillingPlan: async (id: string) => { if (!remote.has(id)) throw Error('Unknown QA plan'); return remote.get(id); }, createBillingPlan: async (body: unknown, key: string) => { planCreates++; const id = 'P-QA' + key.replace(/[^A-Za-z0-9]/g, ''); remote.set(id, body); return { id }; } },
  };
  mocks['./paypal'] = mocks['@/lib/billing/paypal'];
  mocks['./client'] = mocks['@/lib/prospecting/client'];
  mocks['./access'] = mocks['@/lib/network/access'];
  mocks['./notifications'] = { queueNotification: async () => {} };
  const load = pdfRuntime(mocks, { Date: Clock, Error, process: { env, cwd: () => process.cwd() }, fetch: () => { throw Error('No external network is allowed in commerce regression tests'); } });
  const commerce = load<typeof import('../src/lib/billing/commerce')>('src/lib/billing/commerce.ts');
  const tokens = load<typeof import('../src/lib/tokens/service')>('src/lib/tokens/service.ts');
  const prospects = load<typeof import('../src/lib/prospecting/service')>('src/lib/prospecting/service.ts');
  const network = load<typeof import('../src/lib/network/service')>('src/lib/network/service.ts');
  const checkout = load<typeof import('../src/app/api/billing/subscribe/route')>('src/app/api/billing/subscribe/route.ts');
  const routes = load<typeof import('../src/app/api/admin/billing/settings/route')>('src/app/api/admin/billing/settings/route.ts');
  const generic = load<typeof import('../src/app/api/admin/settings/route')>('src/app/api/admin/settings/route.ts');
  const req = (value: unknown, origin = 'https://nova.test') => new Request('https://nova.test/api/admin/billing/settings', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value) });
  async function member() { const row = await db.user.create({ data: { email: `commerce-${randomUUID()}@example.invalid`, plan: 'business', matchmakingProfile: { create: { visible: true, displayName: 'Private QA', role: 'founder', categories: ['collaboration'], country: 'TW', industry: 'saas', slogan: '', offers: '', looksFor: '', visibleFields: [] } } } }); ids.push(row.id); return row; }
  async function save(policy: ReturnType<typeof defaultCommercePolicy>) { const current = await commerce.commerceSettings(); return commerce.mutateCommerce({ action: 'save', revision: current.draft.revision, requestId: randomUUID(), policy }, 'qa-admin@example.invalid'); }
  async function publish() { const current = await commerce.commerceSettings(); return commerce.mutateCommerce({ action: 'publish', revision: current.draft.revision, requestId: randomUUID() }, 'qa-admin@example.invalid'); }
  const user = await member(), original = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  let oldHold = '', state = await commerce.commerceSettings();
  try {
    await t.test('Price constraint migration preserves old data and can run twice', async () => {
      await tokens.tokenSnapshot(user.id);
      const hold = await db.$transaction(tx => tokens.reserveTokens(tx, { userId: user.id, kind: 'invite', requestId: randomUUID(), resourceId: 'qa-legacy-hold', payloadHash: 'qa', expiresAt: new Date(clock + 86400000) })); oldHold = hold.id;
      const old = await db.tokenReservation.findUniqueOrThrow({ where: { id: hold.id } });
      const con = await db.$queryRaw<Array<{ name: string }>>`SELECT conname::text AS name FROM pg_constraint WHERE conrelid='"TokenReservation"'::regclass AND conname='TokenReservation_price'`;
      if (!con.length) await db.$executeRawUnsafe('ALTER TABLE "TokenReservation" ADD CONSTRAINT "TokenReservation_price" CHECK (("kind"=\'invite\' AND "amount"=5) OR ("kind"=\'search\' AND "amount"=20))');
      for (let i = 0; i < 2; i++) { const report = JSON.parse(execFileSync(process.execPath, ['scripts/apply-commerce-pricing.mjs', '--apply'], { env: { ...process.env, ROLL_REWARDS_TEST_DATABASE_URL: connectionString }, encoding: 'utf8' })); assert.equal(report.unchanged, true); if (i === 1) assert.equal(report.alreadyInstalled, true); }
      assert.deepEqual(await db.tokenReservation.findUniqueOrThrow({ where: { id: hold.id } }), old);
    });
    await t.test('Admin authentication, same-origin writes, validation and generic-key bypass protection', async () => {
      assert.equal((await routes.GET()).status, 401);
      assert.equal((await routes.POST(req({}))).status, 401); admin = true;
      assert.equal((await routes.POST(req({}, 'https://evil.example'))).status, 403);
      assert.equal((await routes.POST(req({ action: 'save', requestId: randomUUID(), revision: 0, policy: { ...state.draft.policy, cashCheckoutEnabled: true } }))).status, 400);
      const bypass = new Request('https://nova.test/api/admin/settings', { method: 'PUT', headers: { origin: 'https://nova.test', 'content-type': 'application/json' }, body: JSON.stringify({ key: commercePrefix + 'published', value: {} }) });
      assert.equal((await generic.PUT(bypass as never)).status, 409);
      assert.equal((await commerce.publishedCommerce()).version, 1);
    });
    await t.test('Drafts do not change live fees; repeated saves are idempotent and conflicting writes preserve the latest draft', async () => {
      const policy = { ...state.draft.policy, tokens: { ...state.draft.policy.tokens, inviteFee: 7, searchFee: 35, monthlyGrant: 200, dailyInvites: 8 }, packs: [{ id: 'pack-100', tokens: 100, currency: 'USD' as const, amountMinor: 1000 }] };
      const input = { action: 'save' as const, revision: 0, requestId: randomUUID(), policy };
      const responses = await Promise.all([routes.POST(req(input)), routes.POST(req(input))]); for (const response of responses) assert.equal(response.status, 200); state = (await responses[0].json()).data;
      assert.equal((await commerce.tokenQuote()).inviteFee, 5);
      assert.equal((await routes.POST(req(input))).status, 200);
      assert.equal((await commerce.commerceSettings()).draft.revision, 1);
      assert.equal((await routes.POST(req({ ...input, policy: { ...policy, tokens: { ...policy.tokens, inviteFee: 9 } } }))).status, 409);
      assert.equal((await routes.POST(req({ ...input, requestId: randomUUID() }))).status, 409);
    });
    await t.test('Publishing changes new holds only; old holds refund the original amount and old monthly grants stay untouched', async () => {
      const input = { action: 'publish' as const, revision: state.draft.revision, requestId: randomUUID() };
      [state] = await Promise.all([commerce.mutateCommerce(input, 'qa-admin@example.invalid'), commerce.mutateCommerce(input, 'qa-admin@example.invalid')]);
      await commerce.mutateCommerce(input, 'qa-admin@example.invalid'); assert.equal((await commerce.publishedCommerce()).version, 2);
      assert.equal((await commerce.tokenQuote()).monthlyGrant, 150);
      assert.equal((await commerce.tokenQuote()).nextMonthlyGrant, 200);
      assert.equal((await db.tokenReservation.findUniqueOrThrow({ where: { id: oldHold } })).amount, 5);
      await db.$transaction(tx => tokens.settleTokens(tx, oldHold, 'refund', 'QA original hold returned'));
      assert.equal((await tokens.tokenSnapshot(user.id)).available, 150);
      const newer = await db.$transaction(tx => tokens.reserveTokens(tx, { userId: user.id, kind: 'invite', requestId: randomUUID(), resourceId: 'qa-new-hold', payloadHash: 'new', expiresAt: new Date(clock + 86400000) }));
      assert.equal(newer.amount, 7); assert.equal((newer.metadata as { pricing: { version: number } }).pricing.version, 2);
      const fresh = await member(); assert.equal((await tokens.tokenSnapshot(fresh.id)).available, 150);
      assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: user.id } }), original);
    });
    await t.test('Stale new searches fail before a hold; old request receipts replay unchanged and quota changes are enforced', async () => {
      const body = { requestId: randomUUID(), pricingVersion: 1, revision: 0, country: 'TW', description: 'QA target software companies', count: 5 as const };
      const before = (await tokens.tokenSnapshot(user.id)).available;
      await assert.rejects(prospects.createProspectOrder(user.id, body), e => (e as MemberError).status === 409);
      assert.equal((await tokens.tokenSnapshot(user.id)).available, before);
      const created = await prospects.createProspectOrder(user.id, { ...body, pricingVersion: 2 });
      assert.equal((await db.tokenReservation.findFirstOrThrow({ where: { resourceId: created.id } })).amount, 35);
      await db.prospectingOrder.update({ where: { id: created.id }, data: { status: 'completed', deliveredCount: 5, reservedCount: 0 } });
      let snapshot = await prospects.prospectSnapshot(user.id);
      const second = await prospects.createProspectOrder(user.id, { ...body, requestId: randomUUID(), pricingVersion: 2, revision: snapshot.workspace.revision });
      await db.prospectingOrder.update({ where: { id: second.id }, data: { status: 'completed', deliveredCount: 5, reservedCount: 0 } });
      snapshot = await prospects.prospectSnapshot(user.id);
      await assert.rejects(prospects.createProspectOrder(user.id, { ...body, requestId: randomUUID(), pricingVersion: 2, revision: snapshot.workspace.revision }), /Monthly|本月/);
      state = await commerce.commerceSettings(); await save({ ...state.draft.policy, tokens: { ...state.draft.policy.tokens, monthlyCompanies: 15 } }); await publish();
      assert.equal((await prospects.createProspectOrder(user.id, { ...body, pricingVersion: 2 })).id, created.id);
      snapshot = await prospects.prospectSnapshot(user.id); assert.equal(snapshot.quota.remaining, 5);
      assert.equal((await prospects.createProspectOrder(user.id, { ...body, requestId: randomUUID(), pricingVersion: 3, revision: snapshot.workspace.revision })).status, 'pending');
    });
    await t.test('An existing POC gift remains grandfathered when the published search price changes', async () => {
      const poc = await member();
      await db.$transaction(tx => tokens.grantTokens(tx, poc.id, 20, `poc:${poc.id}`, 'QA old POC grant'));
      const held = await db.$transaction(tx => tokens.reserveTokens(tx, { userId: poc.id, kind: 'search', poc: true, requestId: randomUUID(), resourceId: 'qa-poc', payloadHash: 'poc', expiresAt: new Date(clock + 86400000) }));
      assert.equal(held.amount, 20);
      assert.equal(await db.tokenLedger.count({ where: { userId: poc.id, eventKey: `poc:${poc.id}` } }), 1);
    });
    await t.test('Invitation fee confirmation and daily limit use the current published policy', async () => {
      const target = await member(), card = await db.matchmakingProfile.findUniqueOrThrow({ where: { userId: target.id } });
      const input = { profileId: card.id, requestId: randomUUID(), pricingVersion: 1, opening: 'QA invitation with published fee', conditions: [] };
      await assert.rejects(network.invite(user.id, input), e => (e as MemberError).status === 409);
      const row = await network.invite(user.id, { ...input, pricingVersion: 3 });
      assert.equal((await db.tokenReservation.findFirstOrThrow({ where: { resourceId: row.id } })).amount, 7);
      assert.equal(rateLimits.filter(row => row.key.startsWith('network-invite:')).at(-1)!.max, 8);
    });
    await t.test('Monthly changes take effect next UTC month, including a zero grant, without retry conflicts', async () => {
      clock = Date.parse('2026-12-01T00:00:00Z');
      await Promise.all([tokens.tokenSnapshot(user.id), tokens.tokenSnapshot(user.id)]);
      const grant = await db.tokenLedger.findUniqueOrThrow({ where: { eventKey: `monthly:${user.id}:2026-12` } }); assert.equal(grant.availableDelta, 200);
      state = await commerce.commerceSettings(); await save({ ...state.draft.policy, tokens: { ...state.draft.policy.tokens, monthlyGrant: 0 } }); await publish();
      assert.equal((await commerce.tokenQuote()).monthlyGrant, 200);
      clock = Date.parse('2027-01-01T00:00:00Z'); await tokens.tokenSnapshot(user.id); await tokens.tokenSnapshot(user.id);
      assert.equal((await db.tokenLedger.findUniqueOrThrow({ where: { eventKey: `monthly:${user.id}:2027-01` } })).availableDelta, 0);
      assert.equal((await db.tokenLedger.findUniqueOrThrow({ where: { eventKey: `monthly:${user.id}:2026-12` } })).id, grant.id);
      const invalid = await member(), other = await member(), key = `monthly:${invalid.id}:2027-01`;
      const wrongOwner = await db.tokenLedger.create({ data: { userId: other.id, eventKey: key, kind: 'grant', availableDelta: 150, reservedDelta: 0, reason: '每月方案贈額 / Monthly plan grant' } });
      await assert.rejects(tokens.tokenSnapshot(invalid.id), /Monthly grant record mismatch|月贈額紀錄不一致/);
      await db.tokenLedger.delete({ where: { id: wrongOwner.id } });
      await db.tokenLedger.create({ data: { userId: invalid.id, eventKey: key, kind: 'grant', availableDelta: -1, reservedDelta: 0, reason: '每月方案贈額 / Monthly plan grant' } });
      await assert.rejects(tokens.tokenSnapshot(invalid.id), /Monthly grant record mismatch|月贈額紀錄不一致/);
    });
    await t.test('Changed subscription prices require a matching new PayPal plan; archived plans retain their original price', async () => {
      state = await commerce.commerceSettings(); const policy = state.draft.policy;
      await save({ ...policy, subscriptions: { ...policy.subscriptions, pro: { ...policy.subscriptions.pro, month: { ...policy.subscriptions.pro.month, amountMinor: 5900 } } } });
      await assert.rejects(publish(), /reassigned|舊 PayPal/);
      state = await commerce.commerceSettings(); state = await commerce.mutateCommerce({ action: 'prepare', plan: 'pro', interval: 'month', revision: state.draft.revision, requestId: randomUUID() }, 'qa-admin@example.invalid');
      const oldId = state.draft.policy.subscriptions.pro.month.paypalPlanId; assert.equal(planCreates, 1);
      await publish(); assert.equal((await commerce.activeBillingCatalog()).catalog.pro.variants!.month.amountMinor, 5900);
      await assert.rejects(commerce.assertCurrentCouponPrice('pro', 'month'), /promotion|優惠/);
      state = await commerce.commerceSettings(); await save({ ...state.draft.policy, subscriptions: { ...state.draft.policy.subscriptions, pro: { ...state.draft.policy.subscriptions.pro, month: { ...state.draft.policy.subscriptions.pro.month, amountMinor: 6900 } } } });
      state = await commerce.commerceSettings(); await commerce.mutateCommerce({ action: 'prepare', plan: 'pro', interval: 'month', revision: state.draft.revision, requestId: randomUUID() }, 'qa-admin@example.invalid'); await publish();
      assert.equal((await commerce.resolveBillingPlan(oldId))!.amountMinor, 5900);
      const current = await commerce.commerceSettings(); assert.equal(current.live.policy.cashCheckoutEnabled, false); assert(current.history.length >= 5);
      const ledger = await db.tokenLedger.findMany({ where: { userId: user.id } }); const wallet = await db.tokenWallet.findUniqueOrThrow({ where: { userId: user.id } });
      assert.equal(ledger.reduce((sum, row) => sum + row.availableDelta, 0), wallet.available); assert.equal(ledger.reduce((sum, row) => sum + row.reservedDelta, 0), wallet.reserved);
    });    await t.test('Checkout requires the shown version, ignores client pricing and replays old subscriptions after publication', async () => {
      const buyer = await member(); sessionUser = buyer.id;
      const current = await commerce.publishedCommerce(), body = { plan: 'pro', interval: 'month', locale: 'en', pricingVersion: current.version, requestId: randomUUID(), amountMinor: 1 };
      const request = (value: unknown) => new Request('https://nova.test/api/billing/subscribe', { method: 'POST', headers: { origin: 'https://nova.test', 'content-type': 'application/json' }, body: JSON.stringify(value) });
      assert.equal((await checkout.POST(request({ ...body, pricingVersion: current.version - 1 }) as never)).status, 409); assert.equal(subscriptionsCreated, 0);
      assert.equal((await checkout.POST(request(body) as never)).status, 200); assert.equal(subscriptionsCreated, 1);
      const local = await db.subscription.findUniqueOrThrow({ where: { checkoutRequestId: body.requestId } }); assert.equal(local.amountMinor, 6900); assert.equal(local.currency, 'USD');
      await publish();
      assert.equal((await checkout.POST(request(body) as never)).status, 200); assert.equal(subscriptionsCreated, 1);
      assert.equal((await checkout.POST(request({ ...body, plan: 'business' }) as never)).status, 409);
      const live = await commerce.publishedCommerce(), liveId = live.policy.subscriptions.pro.month.paypalPlanId;
      remote.set(liveId, regularPlanBody('QA-PRODUCT', 'pro', 'month', 100));
      const different = await member(); sessionUser = different.id;
      assert.equal((await checkout.POST(request({ ...body, requestId: randomUUID(), pricingVersion: live.version }) as never)).status, 503); assert.equal(subscriptionsCreated, 1);
      assert.equal((await db.subscription.findUniqueOrThrow({ where: { checkoutRequestId: body.requestId } })).amountMinor, 6900);
    });

  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.setting.deleteMany({ where: { key: { startsWith: commercePrefix } } }); await db.$disconnect(); }
});
