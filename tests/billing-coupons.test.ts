import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const native = createRequire(import.meta.url);
const instant = Date.parse("2026-11-15T00:00:00Z");
class Clock extends Date { constructor(value?: string | number | Date) { super(value === undefined ? instant : value instanceof Date ? value.getTime() : value); } static now() { return instant; } }
function loader(mocks: Record<string, unknown>, env: Record<string, string> = {}, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { exports: unknown }>();
  function load<T>(file: string): T {
    const path = resolve(file); if (cache.has(path)) return cache.get(path)!.exports as T;
    const loaded = { exports: {} }; cache.set(path, loaded);
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, process: { env }, Date: Clock, Error, URL, Buffer, Headers, Request, Response, AbortSignal, console, fetch: fetcher, require: (name: string) => name === "server-only" ? {} : name in mocks ? mocks[name] : name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : name.startsWith(".") ? load(resolve(dirname(path), `${name}.ts`)) : native(name) });
    return loaded.exports as T;
  }
  return load;
}
const env: Record<string, string> = { PAYPAL_ENV: "sandbox", BILLING_NOVA60_ENABLED: "true", MEMBER_NETWORK_ENABLED: "true", BILLING_REQUIRE_EXPLICIT_ENTITLEMENT: "true" };
for (const p of ["PRO", "BUSINESS"]) for (const i of ["MONTHLY", "YEARLY"]) { env[`PAYPAL_PLAN_ID_${p}_${i}_USD`] = `BASE-${p}-${i}`; env[`PAYPAL_PLAN_ID_NOVA60_${p}_${i}_USD`] = `PROMO-${p}-${i}`; }
const pure = loader({}, env), coupon = pure<typeof import("../src/lib/billing/coupons")>("src/lib/billing/coupons.ts"), plans = pure<typeof import("../src/lib/billing/plans")>("src/lib/billing/plans.ts");
test("NOVA60 uses 40% first-period prices, exact Taipei November boundaries, and unchanged renewals", () => {
  for (const [plan, interval, first, regular] of [["pro", "month", 1960, 4900], ["business", "month", 5960, 14900], ["pro", "year", 18720, 46800], ["business", "year", 66720, 166800]] as const) {
    const q = coupon.couponQuote(" nova60 ", plan, interval);
    assert.equal(q.firstAmountMinor, first); assert.equal(q.regularAmountMinor, regular);
    const body = coupon.couponPlanBody("PRODUCT", q); coupon.assertCouponPlan(body, q, "PRODUCT");
    assert.equal(body.billing_cycles[0].total_cycles, 1); assert.equal(body.billing_cycles[1].total_cycles, 0);
    assert.equal(plans.billingFromPaypalPlanId(coupon.couponPaypalPlanId(plan, interval))?.plan, plan);
  }
  assert.throws(() => coupon.couponQuote("NOVA60", "pro", "month", new Date("2026-10-31T15:59:59.999Z")), /November|11/);
  assert(coupon.couponQuote("NOVA60", "pro", "month", new Date("2026-10-31T16:00:00Z")));
  assert(coupon.couponQuote("NOVA60", "pro", "month", new Date("2026-11-30T15:59:59.999Z")));
  assert.throws(() => coupon.couponQuote("NOVA60", "pro", "month", new Date("2026-11-30T16:00:00Z")), /November|11/);
  assert.throws(() => coupon.couponQuote("OTHER", "pro", "month"), /Invalid|無效/);
  assert.throws(() => coupon.couponQuote("NOVA60", "enterprise", "month"), /新購|new/);
  const disabled = loader({}, { ...env, BILLING_NOVA60_ENABLED: "false" })<typeof import("../src/lib/billing/coupons")>("src/lib/billing/coupons.ts");
  assert.throws(() => disabled.couponQuote("NOVA60", "pro", "month"), /not available|未開放/);
});
test("Meet Taipei and custom aliases preserve the campaign and first-period-only terms", () => {
  const original = coupon.couponQuote("NOVA60", "pro", "month");
  const meet = coupon.couponQuote(" meettaipei60 ", "pro", "month");
  assert.equal(meet.code, "MEETTAIPEI60"); assert.equal(meet.campaign, original.campaign);
  assert.equal(meet.firstAmountMinor, 1960); assert.equal(meet.regularAmountMinor, 4900);
  const codes = { NOVA60: true, MEETTAIPEI60: false, EVENT60: true };
  assert.throws(() => coupon.couponQuote("MEETTAIPEI60", "pro", "month", new Date(instant), codes), /無效|Invalid/);
  assert.equal(coupon.couponQuote("event60", "business", "year", new Date(instant), codes).code, "EVENT60");
  assert.throws(() => coupon.couponQuote("toString", "pro", "month"), /無效|Invalid/);
  assert.throws(() => coupon.couponQuote("MEETTAIPEI60", "pro", "month", new Date("2026-11-30T16:00:00Z")), /November|11/);
});
test("Unexpected price, currency, duration, setup fee, tax, quantity or product fails closed", () => {
  const q = coupon.couponQuote("NOVA60", "pro", "month"), body = coupon.couponPlanBody("PRODUCT", q);
  for (const mutate of [(v: typeof body) => v.billing_cycles[0].pricing_scheme.fixed_price.value = "49.00", (v: typeof body) => v.billing_cycles[0].total_cycles = 2, (v: typeof body) => v.product_id = "OTHER", (v: typeof body) => v.billing_cycles[1].pricing_scheme.fixed_price.currency_code = "TWD"]) { const v = structuredClone(body); mutate(v); assert.throws(() => coupon.assertCouponPlan(v, q, "PRODUCT"), /does not match|不一致/); }
  for (const extra of [{ taxes: { percentage: "1" } }, { payment_preferences: { setup_fee: { value: "1" } } }, { quantity_supported: true }]) assert.throws(() => coupon.assertCouponPlan({ ...body, ...extra }, q, "PRODUCT"));
});

test("Coupon checkout transactions preserve receipts, idempotency, eligibility and uncertain outcomes", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.ROLL_REWARDS_TEST_DATABASE_URL!); assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, max: 10 }) });
  let breakSave = false, mode = "normal", posts = 0;
  const receipts = new Map<string, { id: string; status: string; plan_id: string; links: { rel: string; href: string; method: string }[]; billing_info: { next_billing_time: string } }>(), bodies: unknown[] = [], ids: string[] = [];
  const wrapped = db.$extends({ query: { billingCouponCheckout: { update({ args, query }) { if (breakSave && args.data.status === "ready") throw new Error("Injected persistence failure"); return query(args); } } } });
  class ProviderError extends Error { constructor(public status: number) { super("private-provider-secret"); } }
  const session = { uid: null as string | null, validSignature: true };
  const provider = {
    PaypalSubscriptionError: ProviderError,
    getBillingPlan: async (id: string) => { if (id.startsWith("BASE")) return { product_id: "PRODUCT" }; const plan = id.includes("BUSINESS") ? "business" : "pro", interval = id.includes("YEARLY") ? "year" : "month"; const body = coupon.couponPlanBody("PRODUCT", coupon.couponQuote("NOVA60", plan, interval)); if (mode === "custom80") body.billing_cycles[0].pricing_scheme.fixed_price.value = (Number(body.billing_cycles[1].pricing_scheme.fixed_price.value) * 0.2).toFixed(2); if (mode === "mismatch") body.billing_cycles[0].pricing_scheme.fixed_price.value = "100"; return body; },
    createSubscription: async (body: { planId: string; requestId: string }) => { posts++; bodies.push(structuredClone(body)); if (mode === "rejected") throw new ProviderError(422); let receipt = receipts.get(body.requestId); if (!receipt) { receipt = { id: `I-${randomUUID()}`, status: "APPROVAL_PENDING", plan_id: body.planId, links: [{ rel: "approve", method: "GET", href: `https://www.paypal.com/webapps/billing/subscriptions?ba_token=${randomUUID()}` }], billing_info: { next_billing_time: "2026-12-15T00:00:00Z" } }; receipts.set(body.requestId, receipt); } if (mode === "timeout") { mode = "normal"; throw new Error("Unknown acceptance private-provider-secret"); } return { id: receipt.id, status: receipt.status, approveUrl: receipt.links[0].href }; },
    getSubscription: async (id: string) => { const found = [...receipts.values()].find(r => r.id === id); assert(found); return found; },
    verifyWebhookSignature: async () => session.validSignature,
  };
  const load = loader({
    "@/lib/prisma": { prisma: wrapped }, "@/lib/rate-limit": { MINUTE_MS: 60000, checkRateLimit: async () => ({ ok: true }) },
    "./paypal": provider, "@/lib/billing/paypal": provider,
    "@/lib/auth/guard": { getUserSession: async () => session.uid ? { uid: session.uid } : null },
    "@/lib/referrals/service": { trySyncUserReferral: async () => {}, syncUserReferral: async () => {}, recordReferralRefund: async () => {} },
    "@/lib/billing/credits": {}, "@/lib/security/log": { logSecurityError: () => "coupon-qa", publicErrorMessage: () => "Retry (coupon-qa)" },
    "next/server": { after: () => {}, NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
  }, env);
  const service = load<typeof import("../src/lib/billing/coupon-checkout")>("src/lib/billing/coupon-checkout.ts"), reconcile = load<typeof import("../src/lib/billing/reconcile")>("src/lib/billing/reconcile.ts");
  async function user() { const u = await db.user.create({ data: { email: `coupon-${randomUUID()}@example.invalid` } }); ids.push(u.id); return u; }
  const input = (u: { id: string; email: string }) => ({ userId: u.id, email: u.email, requestId: randomUUID(), code: "NOVA60", plan: "pro" as const, interval: "month" as const, returnUrl: "https://rollon.com.tw/dashboard/billing/return", cancelUrl: "https://rollon.com.tw/dashboard/billing?cancelled=1" });
  const clean = async (id: string) => { await db.user.delete({ where: { id } }); };
  try {
    await t.test("Admin codes merge concurrent additions; disable blocks new checkout but retains old receipts and shared eligibility", async () => {
      const codes = load<typeof import("../src/lib/billing/coupon-codes")>("src/lib/billing/coupon-codes.ts");
      assert.equal(await db.setting.findUnique({ where: { key: codes.couponCodesKey } }), null);
      const u = await user(), other = await user();
      try {
        await Promise.all([codes.saveCouponCode({ code: "event60", enabled: true }), codes.saveCouponCode({ code: "PARTNER60", enabled: true })]);
        const saved = await codes.readCouponCodes(); assert.equal(saved.EVENT60, true); assert.equal(saved.PARTNER60, true);
        await assert.rejects(codes.saveCouponCode({ code: "bad code", enabled: true }), /代碼/);
        const request = { ...input(u), code: "MEETTAIPEI60" }; const first = await service.checkoutWithCoupon(request);
        const checkout = await db.billingCouponCheckout.findFirstOrThrow({ where: { userId: u.id } });
        assert.equal(checkout.code, "MEETTAIPEI60"); assert.equal(checkout.campaign, "november-2026");
        await codes.saveCouponCode({ code: "MEETTAIPEI60", enabled: false });
        const before = posts;
        assert.equal((await service.checkoutWithCoupon({ ...request, couponRevision: 0 })).approveUrl, first.approveUrl);
        await assert.rejects(service.checkoutWithCoupon({ ...input(other), code: "MEETTAIPEI60" }), /無效|Invalid/); assert.equal(posts, before);
        const remote = [...receipts.values()].find(r => r.id === checkout.paypalSubscriptionId)!; remote.status = "ACTIVE";
        await reconcile.reconcileFromPaypal(remote);
        await assert.rejects(service.checkoutWithCoupon({ ...input(u), code: "EVENT60" }), /already used|已使用/);
      } finally { await db.setting.deleteMany({ where: { key: codes.couponCodesKey } }); await clean(u.id); await clean(other.id); }
    });
    await t.test("80 percent checkout snapshots survive edits and disabling; activation consumes eligibility", async () => {
      const codes=load<typeof import("../src/lib/billing/coupon-codes")>("src/lib/billing/coupon-codes.ts"),u=await user();
      assert.equal(await db.setting.findUnique({where:{key:codes.couponCodesKey}}),null);
      try {
        await codes.saveCouponCode({code:"EVENT80",enabled:false,revision:0,terms:{percentOff:80,startsAt:"2026-11-01T00:00:00.000Z",endsAt:"2027-01-01T00:00:00.000Z"}});
        const values=await codes.readCouponCodes(),entry=values.EVENT80;if(typeof entry!=="object")throw Error("Missing rule");
        entry.plans=Object.fromEntries(["pro","business"].flatMap(p=>["month","year"].map(i=>[`sandbox:${p}:${i}`,`PROMO-${p.toUpperCase()}-${i==='month'?'MONTHLY':'YEARLY'}`])));
        await db.setting.update({where:{key:codes.couponCodesKey},data:{value:values}});await codes.saveCouponCode({code:"EVENT80",enabled:true});
        await assert.rejects(service.checkoutWithCoupon({...input(u),code:"EVENT80",couponRevision:0}),/changed|變更/);
        mode="custom80";const request={...input(u),code:"EVENT80",couponRevision:1},before=posts,first=await service.checkoutWithCoupon(request);
        const checkout=await db.billingCouponCheckout.findFirstOrThrow({where:{userId:u.id}});assert.equal(checkout.firstAmountMinor,980);assert.equal(checkout.regularAmountMinor,4900);
        await codes.saveCouponCode({code:"EVENT80",enabled:false,revision:1,terms:{percentOff:70,startsAt:entry.startsAt,endsAt:entry.endsAt}});
        assert.equal((await service.checkoutWithCoupon(request)).approveUrl,first.approveUrl);assert.equal(posts,before+1);
        const remote=receipts.get((checkout.request as {requestId:string}).requestId)!;remote.status="ACTIVE";await reconcile.reconcileFromPaypal(remote);
        assert((await db.billingCouponCheckout.findUniqueOrThrow({where:{id:checkout.id}})).consumedAt);
        await assert.rejects(service.assertCouponEligibility(u.id),/already used|已使用/);
        assert.equal((await db.billingCouponCheckout.findUniqueOrThrow({where:{id:checkout.id}})).firstAmountMinor,980);
      } finally {mode="normal";await db.setting.deleteMany({where:{key:codes.couponCodesKey}});await clean(u.id);}
    });
    await t.test("Parallel multi-tab submissions and changed content never create duplicate discounted subscriptions", async () => {
      const u = await user(), body = input(u), before = posts;
      const results = await Promise.allSettled([service.checkoutWithCoupon(body), service.checkoutWithCoupon(body)]); assert(results.some(r => r.status === "fulfilled"));
      assert.equal(posts - before, 1); assert.equal(await db.billingCouponCheckout.count({ where: { userId: u.id } }), 1); assert.equal(await db.subscription.count({ where: { userId: u.id } }), 1);
      const first = await service.checkoutWithCoupon(body), again = await service.checkoutWithCoupon({ ...body, requestId: randomUUID() }); assert.equal(first.approveUrl, again.approveUrl); assert.equal(posts - before, 1);
      await assert.rejects(service.checkoutWithCoupon({ ...body, plan: "business" }), /different|其他/);
      const other = await user(); await assert.rejects(service.checkoutWithCoupon({ ...input(other), requestId: body.requestId }), /different|其他/); await clean(other.id); await clean(u.id);
    });
    await t.test("Unknown provider acceptance and failed DB commit retry the exact persisted provider body/key", async () => {
      const u = await user(), body = input(u); mode = "timeout"; const before = bodies.length;
      await assert.rejects(service.checkoutWithCoupon(body), /unconfirmed|尚未確認/); const ready = await service.checkoutWithCoupon(body); assert(ready.approveUrl); assert.deepEqual(bodies[before], bodies[before + 1]);
      await clean(u.id);
      const rollback = await user(), request = input(rollback); breakSave = true;
      await assert.rejects(service.checkoutWithCoupon(request), /unconfirmed|尚未確認/); assert.equal(await db.subscription.count({ where: { userId: rollback.id } }), 0);
      breakSave = false; await service.checkoutWithCoupon(request); assert.equal(await db.subscription.count({ where: { userId: rollback.id } }), 1); await clean(rollback.id);
    });
    await t.test("Unconfirmed requests older than one day stop for reconciliation without another provider POST", async () => {
      const u = await user(), body = input(u); mode = "timeout";
      await assert.rejects(service.checkoutWithCoupon(body), /unconfirmed|尚未確認/); const before = posts;
      await db.billingCouponCheckout.updateMany({ where: { userId: u.id }, data: { createdAt: new Date("2026-11-13T00:00:00Z") } });
      await assert.rejects(service.checkoutWithCoupon(body), (error: unknown) => (error as { code: string }).code === "coupon_reconciliation_required");
      assert.equal(posts, before); assert.equal(await db.billingCouponCheckout.count({ where: { userId: u.id } }), 1); await clean(u.id);
    });
    await t.test("Plan mismatch stops before provider POST and rejected requests do not leak credentials", async () => {
      const u = await user(), before = posts; mode = "mismatch";
      await assert.rejects(service.checkoutWithCoupon(input(u)), /does not match|不一致/); assert.equal(posts, before);
      mode = "rejected"; await assert.rejects(service.checkoutWithCoupon(input(u)), (error: unknown) => { const message = (error as Error).message; assert(!message.includes("private-provider-secret")); assert.match(message, /no payment|未扣款/); return true; });
      mode = "normal"; await service.checkoutWithCoupon(input(u)); await clean(u.id);
    });
    await t.test("Approval consumes once; cancellation does not restore the discount or change trial/AI balances", async () => {
      const u = await user(), before = posts; await service.checkoutWithCoupon(input(u)); const checkout = await db.billingCouponCheckout.findFirstOrThrow({ where: { userId: u.id } });
      assert.equal(checkout.consumedAt, null); const receipt = [...receipts.values()].find(r => r.id === checkout.paypalSubscriptionId)!; receipt.status = "ACTIVE";
      await reconcile.reconcileFromPaypal(receipt); await reconcile.reconcileFromPaypal(receipt);
      const paid = await db.user.findUniqueOrThrow({ where: { id: u.id } }); assert.equal(paid.plan, "pro"); assert.equal(paid.trialEndsAt, null); assert.equal(await db.aiAllowance.count({ where: { userId: u.id } }), 0);
      assert((await db.billingCouponCheckout.findUniqueOrThrow({ where: { id: checkout.id } })).consumedAt);
      receipt.status = "CANCELLED"; await reconcile.reconcileFromPaypal(receipt); await assert.rejects(service.checkoutWithCoupon(input(u)), /already used|已使用/); assert.equal(posts - before, 1); await clean(u.id);
    });
    await t.test("Four discount variants complete return and repeated webhook reconciliation; forged and cross-account requests are refused", async () => {
      const confirm = load<typeof import("../src/app/api/billing/confirm/route")>("src/app/api/billing/confirm/route.ts");
      const webhook = load<typeof import("../src/app/api/billing/webhook/route")>("src/app/api/billing/webhook/route.ts");
      const request = (path: string, body: unknown, origin = "https://rollon.com.tw") => new Request(`https://rollon.com.tw${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never;
      for (const [plan, interval, first, regular] of [["pro", "month", 1960, 4900], ["pro", "year", 18720, 46800], ["business", "month", 5960, 14900], ["business", "year", 66720, 166800]] as const) {
        const u = await user(); await service.checkoutWithCoupon({ ...input(u), plan, interval });
        const checkout = await db.billingCouponCheckout.findFirstOrThrow({ where: { userId: u.id } });
        const remote = [...receipts.values()].find(r => r.id === checkout.paypalSubscriptionId)!;
        const body = { subscriptionId: remote.id }; session.uid = null;
        assert.equal((await confirm.POST(request("/api/billing/confirm", body))).status, 401);
        const other = await user(); session.uid = other.id;
        assert.equal((await confirm.POST(request("/api/billing/confirm", body))).status, 404); await clean(other.id);
        session.uid = u.id;
        assert.equal((await confirm.POST(request("/api/billing/confirm", body, "https://wrong.example"))).status, 403);
        assert.equal((await (await confirm.POST(request("/api/billing/confirm", body))).json()).data.status, "APPROVAL_PENDING");
        assert.equal((await db.billingCouponCheckout.findUniqueOrThrow({ where: { id: checkout.id } })).consumedAt, null);
        remote.status = "ACTIVE";
        assert.equal((await (await confirm.POST(request("/api/billing/confirm", body))).json()).data.status, "ACTIVE");
        const activated = await db.billingCouponCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
        assert(activated.consumedAt); assert.equal(activated.firstAmountMinor, first); assert.equal(activated.regularAmountMinor, regular);
        const eventId = `coupon-qa-${randomUUID()}`, event = { id: eventId, event_type: "PAYMENT.SALE.COMPLETED", resource: { id: `sale-${randomUUID()}`, billing_agreement_id: remote.id } };
        try {
          session.validSignature = false;
          assert.equal((await webhook.POST(request("/api/billing/webhook", event))).status, 401);
          assert.equal(await db.webhookEvent.count({ where: { id: eventId } }), 0);
          session.validSignature = true;
          for (let i = 0; i < 2; i++) assert.equal((await webhook.POST(request("/api/billing/webhook", event))).status, 200);
          assert.equal(await db.webhookEvent.count({ where: { id: eventId } }), 1);
          const paid = await db.user.findUniqueOrThrow({ where: { id: u.id } }); assert.equal(paid.plan, plan); assert.equal(paid.subscriptionStatus, "ACTIVE");
          const sub = await db.subscription.findUniqueOrThrow({ where: { paypalSubscriptionId: remote.id } }); assert.equal(sub.amountMinor, regular); assert.equal(sub.billingInterval, interval);
          assert.equal((await db.billingCouponCheckout.findUniqueOrThrow({ where: { id: checkout.id } })).consumedAt!.getTime(), activated.consumedAt.getTime());
        } finally { await db.webhookEvent.deleteMany({ where: { id: eventId } }); await clean(u.id); }
      }
      session.uid = null;
    });
    await t.test("Unpaid expired attempts retain history and permit a fresh request, active subscribers are ineligible", async () => {
      const u = await user(); const body = input(u); await service.checkoutWithCoupon(body); const checkout = await db.billingCouponCheckout.findFirstOrThrow({ where: { userId: u.id } });
      [...receipts.values()].find(r => r.id === checkout.paypalSubscriptionId)!.status = "EXPIRED";
      await assert.rejects(service.checkoutWithCoupon(body), /closed|結束/); await service.checkoutWithCoupon({ ...body, requestId: randomUUID(), interval: "year" }); assert.equal(await db.billingCouponCheckout.count({ where: { userId: u.id } }), 2); await clean(u.id);
      const active = await user(); await db.subscription.create({ data: { userId: active.id, paypalSubscriptionId: `I-${randomUUID()}`, paypalPlanId: "BASE-PRO-MONTHLY", plan: "pro", status: "ACTIVE" } }); await assert.rejects(service.checkoutWithCoupon(input(active)), /new subscriptions|新購/); await clean(active.id);
    });
  } finally { for (const id of ids) await db.user.deleteMany({ where: { id } }); await db.$disconnect(); }
});

test("Coupon APIs require sign-in/admin, same-origin writes, and reject client-supplied prices", async () => {
  let member = false, admin = false, prepared = 0, savedCodes = 0;
  const codesModule = loader({ "@/lib/prisma": { prisma: {} } }, env)<typeof import("../src/lib/billing/coupon-codes")>("src/lib/billing/coupon-codes.ts");
  const load = loader({
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/auth/account": { getCurrentAccount: async () => member ? { id: "member", email: "member@example.invalid" } : null },
    "@/lib/auth/guard": { requireAdmin: async () => admin ? { email: "admin@example.invalid" } : null },
    "@/lib/rate-limit": { MINUTE_MS: 60000, checkRateLimit: async () => ({ ok: true }) },
    "@/lib/billing/commerce": { activeBillingCatalog: async () => ({ version: 1, catalog: plans.PLAN_CONFIG }) },
    "@/lib/billing/coupon-codes": { couponCodeInput: codesModule.couponCodeInput, readCouponCodes: async () => coupon.DEFAULT_COUPON_CODES, saveCouponCode: async () => { savedCodes++; } },
    "@/lib/billing/coupon-checkout": { assertCouponEligibility: async () => {} },
    "@/lib/billing/coupon-setup": { couponSetupStatus: async () => ({ enabled: false }), prepareCouponPlan: async () => { prepared++; return { id: "P-TEST" }; } },
  }, env);
  const quote = load<typeof import("../src/app/api/billing/coupon/route")>("src/app/api/billing/coupon/route.ts"), setup = load<typeof import("../src/app/api/admin/billing/coupon/route")>("src/app/api/admin/billing/coupon/route.ts");
  const req = (body: unknown, origin = "https://rollon.com.tw") => new Request("https://rollon.com.tw/api/billing/coupon", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await quote.POST(req({ code: "NOVA60", interval: "month" }) as never)).status, 401);
  member = true;
  assert.equal((await quote.POST(req({ code: "NOVA60", interval: "month" }, "https://evil.example") as never)).status, 403);
  assert.equal((await quote.POST(req({ code: "NOVA60", interval: "year", firstAmountMinor: 1 }) as never)).status, 400);
  const valid = await quote.POST(req({ code: "nova60", interval: "year" }) as never); assert.equal(valid.status, 200); assert.equal((await valid.json()).data.quotes[0].firstAmountMinor, 18720);
  assert.equal((await setup.GET()).status, 401); assert.equal((await setup.POST(req({ plan: "pro", interval: "month" }) as never)).status, 401);
  assert.equal((await setup.PATCH(req({ code: "TEST60", enabled: true }) as never)).status, 401);
  admin = true;
  assert.equal((await setup.PATCH(req({ code: "TEST60", enabled: true }, "https://evil.example") as never)).status, 403);
  assert.equal((await setup.PATCH(req({ code: "BAD CODE", enabled: true }) as never)).status, 400);
  assert.equal((await setup.PATCH(req({ code: "TEST60", enabled: true, percentOff: 100 }) as never)).status, 400);
  assert.equal((await setup.PATCH(req({ code: "TEST60", enabled: true }) as never)).status, 200); assert.equal(savedCodes, 1);
  assert.equal((await setup.POST(req({ plan: "enterprise", interval: "month" }) as never)).status, 400);
  assert.equal((await setup.POST(req({ plan: "pro", interval: "month", amount: 1 }) as never)).status, 400);
  assert.equal((await setup.POST(req({ plan: "pro", interval: "month" }) as never)).status, 200); assert.equal(prepared, 1);
});

test("PayPal requests use the server-approved plan and stable key, with no client pricing override", async () => {
  const payloads: unknown[] = [];
  const load = loader({}, { PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "test-client", PAYPAL_CLIENT_SECRET: "test-secret" }, async (url, init) => {
    assert(String(url).startsWith("https://api-m.sandbox.paypal.com/"));
    if (String(url).endsWith("oauth2/token")) return Response.json({ access_token: "test-only-token" });
    assert.equal(new Headers(init?.headers).get("PayPal-Request-Id"), "stable-discount-request");
    const body = JSON.parse(String(init?.body)); payloads.push(body); assert.equal(body.plan_id, "P-DISCOUNT"); assert.equal(body.plan, undefined);
    return Response.json({ id: "I-TEST", status: "APPROVAL_PENDING", plan_id: "P-DISCOUNT", links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/approve", method: "GET" }] });
  });
  const paypal = load<typeof import("../src/lib/billing/paypal")>("src/lib/billing/paypal.ts");
  const body = { planId: "P-DISCOUNT", email: "qa@example.invalid", requestId: "stable-discount-request", returnUrl: "https://rollon.com.tw/dashboard/billing/return", cancelUrl: "https://rollon.com.tw/dashboard/billing" };
  await paypal.createSubscription(body); await paypal.createSubscription(body); assert.deepEqual(payloads[0], payloads[1]);
});

test("Admin plan preparation preserves parallel plan IDs and does not enable checkout", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ROLL_REWARDS_TEST_DATABASE_URL!); assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, max: 4 }) });
  const key = "billing.nova60.paypalPlans.sandbox", original = await db.setting.findUnique({ where: { key } }); assert.equal(original, null, "Do not overwrite a pre-existing QA setting");
  let creates = 0; const remote = new Map<string, unknown>(), keys = new Map<string, string>();
  const load = loader({ "@/lib/prisma": { prisma: db }, "./paypal": {
    getBillingPlan: async (id: string) => id.startsWith("BASE") ? { product_id: "PRODUCT" } : remote.get(id),
    createBillingPlan: async (body: unknown, requestId: string) => { if (keys.has(requestId)) return { id: keys.get(requestId)! }; creates++; const id = `P-${randomUUID().replaceAll("-", "")}`; remote.set(id, body); keys.set(requestId, id); return { id }; },
  } }, { ...Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("PAYPAL_PLAN_ID_NOVA60_"))), PAYPAL_ENV: "sandbox", BILLING_NOVA60_ENABLED: "false" });
  const setup = load<typeof import("../src/lib/billing/coupon-setup")>("src/lib/billing/coupon-setup.ts");
  const codes = load<typeof import("../src/lib/billing/coupon-codes")>("src/lib/billing/coupon-codes.ts");
  assert.equal(await db.setting.findUnique({where:{key:"billing.nova60.codes"}}),null);
  try {
    const terms={percentOff:80,startsAt:"2026-11-01T00:00:00.000Z",endsAt:"2027-01-01T00:00:00.000Z"};
    await codes.saveCouponCode({code:"EVENT80",enabled:false,terms,revision:0});
    await assert.rejects(codes.saveCouponCode({code:"EVENT80",enabled:true}),/核對/);
    await Promise.all((["pro","business"] as const).flatMap(plan=>(["month","year"] as const).map(interval=>setup.prepareCouponPlan(plan,interval,"EVENT80"))));
    await codes.saveCouponCode({code:"EVENT80",enabled:true});
    const configured=(await codes.readCouponCodes()).EVENT80;assert.equal(typeof configured,"object");if(typeof configured!=="object")throw Error("Missing terms");assert.equal(Object.keys(configured.plans).length,4);
    const customQuote=coupon.couponQuote("EVENT80","pro","month",new Date(instant),{EVENT80:configured});assert.equal(customQuote.firstAmountMinor,980);
    await codes.saveCouponCode({code:"EVENT80",enabled:false});await codes.saveCouponCode({code:"EVENT80",enabled:true});
    await assert.rejects(codes.saveCouponCode({code:"EVENT80",enabled:false,terms,revision:0}),/更新/);
    await codes.saveCouponCode({code:"EVENT80",enabled:false,terms:{...terms,percentOff:70},revision:1});
    const edited=(await codes.readCouponCodes()).EVENT80;assert.equal(typeof edited==='object'&&Object.keys(edited.plans).length,0);
    assert.equal(remote.size,4);creates=0;
    await Promise.all([setup.prepareCouponPlan("pro", "month"), setup.prepareCouponPlan("business", "year")]);
    let status = await setup.couponSetupStatus(); assert.equal(status.plans.filter(p => p.preparedId).length, 2); assert.equal(status.enabled, false);
    await setup.prepareCouponPlan("pro", "month"); assert.equal(creates, 2); status = await setup.couponSetupStatus(); assert.equal(status.enabled, false);
    assert.equal(await db.subscription.count({ where: { paypalPlanId: { in: [...remote.keys()] } } }), 0);
  } finally { await db.setting.deleteMany({ where: { key: {in:[key,"billing.nova60.codes",...[...remote.keys()].map(id=>"novaCommerce.plan."+id)]} } }); await db.$disconnect(); }
});


test("Payment return refreshes server-rendered access only after confirmed activation", async () => {
  for (const scenario of ["active", "pending", "error", "unmounted", "missing"] as const) {
    let effect: (() => (() => void) | void) | undefined, refreshed = 0, calls = 0; const states: unknown[] = [];
    const router = { refresh: () => { refreshed++; } };
    const load = loader({
      react: { useState: (value: unknown) => [value, (next: unknown) => states.push(next)], useEffect: (callback: typeof effect) => { effect = callback; } },
      "next/navigation": { useRouter: () => router }, "next-intl": { useTranslations: () => (key: string) => key }, "next/link": { default: () => null },
    }, env, async () => { calls++; return scenario === "error" ? Response.json({ error: "Safe billing error" }, { status: 503 }) : Response.json({ data: { status: scenario === "pending" ? "APPROVAL_PENDING" : "ACTIVE" } }); });
    const component = load<typeof import("../src/components/dashboard/BillingReturn")>("src/components/dashboard/BillingReturn.tsx");
    component.default({ locale: "en", subscriptionId: scenario === "missing" ? null : "I-SANDBOX" });
    assert(effect); const cleanup = effect(); if (scenario === "unmounted") cleanup?.();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(refreshed, scenario === "active" ? 1 : 0); assert.equal(calls, scenario === "missing" ? 0 : 1);
    if (scenario === "active") assert(states.includes("success"));
    if (scenario === "error") assert(states.includes("Safe billing error"));
    if (scenario === "pending" || scenario === "missing") assert(states.includes("pending"));
  }
});


test("Custom 80% discounts use exact first-period cents and independent dates", () => {
  const terms = { enabled: true, percentOff: 80, startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2027-01-01T00:00:00.000Z", revision: 1, plans: {} };
  const codes = { EVENT80: terms };
  for (const [plan, interval, expected] of [["pro","month",980],["business","month",2980],["pro","year",9360],["business","year",33360]] as const) {
    const q = coupon.couponQuote("event80",plan,interval,new Date(instant),codes); assert.equal(q.firstAmountMinor,expected);assert.equal(q.percentOff,80);
    const body=coupon.couponPlanBody("PRODUCT",q);coupon.assertCouponPlan(body,q,"PRODUCT");assert.equal(body.billing_cycles[1].pricing_scheme.fixed_price.value,(q.regularAmountMinor/100).toFixed(2));
  }
  assert.throws(()=>coupon.couponQuote("EVENT80","pro","month",new Date(terms.endsAt),codes),/validity|有效/);
  assert.throws(()=>coupon.couponQuote("EVENT80","pro","month",new Date(instant),{EVENT80:{...terms,enabled:false}}));
  assert.throws(()=>coupon.couponPaypalPlanId("pro","month",codes,"EVENT80"),/verification|核對/);
  for(const percentOff of [0,100,-1,80.5]) assert.equal(coupon.couponRuleSchema.safeParse({...terms,percentOff}).success,false);
});
