import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { MemberError } from '@/lib/member-http';
import { commercePolicySchema, defaultCommercePolicy, commerceCatalog, commercePrefix, regularPlanBody, assertRegularPlan } from './commerce-policy';
import { billingFromPaypalPlanId, billingVariantFor, type BillingInterval, type PaypalPlanMatch } from './plans';
import { createBillingPlan, getBillingPlan, isPaypalConfigured } from './paypal';
import { getPaypalEnvironment } from './config';
import { CouponError } from './coupons';
type DB = Prisma.TransactionClient;
const publishedKey = commercePrefix + 'published', draftKey = commercePrefix + 'draft';
const periods = ['month', 'year'] as const, plans = ['pro', 'business'] as const;
const draftSchema = z.object({ revision: z.number().int().nonnegative(), policy: commercePolicySchema, updatedBy: z.string(), updatedAt: z.string() }).strict();
const publishedSchema = z.object({ version: z.number().int().positive(), policy: commercePolicySchema, previousMonthlyGrant: z.number().int().nonnegative(), grantStartsPeriod: z.string(), publishedBy: z.string(), publishedAt: z.string(), environment: z.enum(['live', 'sandbox']).nullable() }).strict();
export type PublishedCommerce = z.infer<typeof publishedSchema>;
export const commerceMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.number().int().nonnegative(), requestId: z.uuid(), policy: commercePolicySchema }).strict(),
  z.object({ action: z.literal('publish'), revision: z.number().int().nonnegative(), requestId: z.uuid() }).strict(),
  z.object({ action: z.literal('prepare'), revision: z.number().int().nonnegative(), requestId: z.uuid(), plan: z.enum(plans), interval: z.enum(periods) }).strict(),
]);
function initial(): PublishedCommerce { return { version: 1, policy: defaultCommercePolicy(), previousMonthlyGrant: 150, grantStartsPeriod: '1970-01', publishedBy: 'system', publishedAt: '', environment: null }; }
async function readPublished(db: DB) {
  const row = await db.setting.findUnique({ where: { key: publishedKey } });
  if (!row) return initial();
  const parsed = publishedSchema.safeParse(row.value);
  if (!parsed.success) throw new MemberError('價格設定格式異常，已停止新交易，請聯絡管理員 / Pricing configuration is invalid; contact an administrator', 503);
  return parsed.data;
}
export async function publishedCommerce(tx?: DB) {
  if (tx) await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('novaCommerce.publish'))::text`;
  return readPublished(tx || prisma as unknown as DB);
}
export const currentMonthlyGrant = (snapshot: PublishedCommerce, period = new Date().toISOString().slice(0, 7)) => period >= snapshot.grantStartsPeriod ? snapshot.policy.tokens.monthlyGrant : snapshot.previousMonthlyGrant;
export async function tokenQuote(tx?: DB) { const value = await publishedCommerce(tx); return { ...value.policy.tokens, monthlyGrant: currentMonthlyGrant(value), nextMonthlyGrant: value.policy.tokens.monthlyGrant, grantStartsPeriod: value.grantStartsPeriod, version: value.version }; }
export async function activeBillingCatalog() { const value = await publishedCommerce(); if (value.environment && value.environment !== getPaypalEnvironment()) throw new MemberError('價格與 PayPal 環境不一致，請聯絡管理員 / Pricing and PayPal environments differ', 503); return { version: value.version, catalog: commerceCatalog(value.policy) }; }
export async function resolveBillingPlan(id: string): Promise<PaypalPlanMatch | null> {
  const legacy = billingFromPaypalPlanId(id); if (legacy) return legacy;
  const row = await prisma.setting.findUnique({ where: { key: commercePrefix + 'plan.' + id } });
  if (!row) return null;
  const value = z.object({ plan: z.enum(plans), interval: z.enum(periods), amountMinor: z.number().int().positive(), environment: z.enum(['live', 'sandbox']) }).parse(row.value);
  if (value.environment !== getPaypalEnvironment()) throw new MemberError('PayPal 方案環境不符 / PayPal plan environment mismatch', 503);
  return { plan: value.plan, interval: value.interval, amountMinor: value.amountMinor, currency: 'USD', legacy: false };
}
export async function assertCurrentCouponPrice(plan: 'pro' | 'business', interval: BillingInterval) {
  const active = await activeBillingCatalog(), current = billingVariantFor(plan, interval, active.catalog), original = billingVariantFor(plan, interval);
  if (current?.amountMinor !== original?.amountMinor) throw new CouponError('目前價格已更新，此舊優惠不適用；請重新確認方案 / Pricing changed; this older promotion is not available for the new price', 'coupon_price_changed', 409);
}
async function readDraft(db: DB, live: PublishedCommerce) { const row = await db.setting.findUnique({ where: { key: draftKey } }); return row ? draftSchema.parse(row.value) : { revision: 0, policy: live.policy, updatedAt: '', updatedBy: 'system' }; }
export async function commerceSettings() {
  const live = await publishedCommerce(), draft = await readDraft(prisma as unknown as DB, live);
  const history = await prisma.setting.findMany({ where: { key: { startsWith: commercePrefix + 'version.' } }, orderBy: { updatedAt: 'desc' }, take: 20 });
  let configured = false; try { configured = isPaypalConfigured(); } catch { }
  return { live, draft, history: history.map(r => publishedSchema.parse(r.value)), paypalConfigured: configured, cashCheckoutAvailable: false };
}
function conflict() { return new MemberError('設定已由其他操作更新，輸入保留；請重新載入並比較 / Settings changed; input retained. Reload and compare', 409); }
async function adminLock(tx: DB) { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('novaCommerce.admin'))::text`; }
function inputHash(input: z.infer<typeof commerceMutationSchema>, actor: string) { return createHash('sha256').update(JSON.stringify({ input, actor })).digest('hex'); }
export async function mutateCommerce(input: z.infer<typeof commerceMutationSchema>, actor: string) {
  const hash = inputHash(input, actor), receiptKey = commercePrefix + 'request.' + input.requestId;
  const previous = await prisma.setting.findUnique({ where: { key: receiptKey } });
  if (previous) { if ((previous.value as { hash?: string }).hash !== hash) throw conflict(); return commerceSettings(); }
  const live = await publishedCommerce(), draft = await readDraft(prisma as unknown as DB, live);
  if (draft.revision !== input.revision) throw conflict();
  let nextPolicy = input.action === 'save' ? input.policy : draft.policy;
  if (input.action === 'prepare') {
    if (!isPaypalConfigured()) throw new MemberError('PayPal 尚未設定，草稿保留 / PayPal is not configured; draft retained', 503);
    const target = nextPolicy.subscriptions[input.plan][input.interval], base = live.policy.subscriptions[input.plan][input.interval].paypalPlanId;
    if (!base) throw new MemberError('需先設定目前的 PayPal 原價方案 / Configure the current PayPal base plan first', 503);
    const product = z.object({ product_id: z.string().min(1) }).parse(await getBillingPlan(base)).product_id;
    const environment = getPaypalEnvironment(), requestId = createHash('sha256').update(JSON.stringify([environment, product, input.plan, input.interval, target.amountMinor])).digest('hex').slice(0, 32);
    const plan = await createBillingPlan(regularPlanBody(product, input.plan, input.interval, target.amountMinor), 'nvp-' + requestId);
    if (!/^P-[A-Za-z0-9]+$/.test(plan.id)) throw new MemberError('PayPal 回傳無效方案，未發布 / Invalid PayPal plan; not published', 503);
    try { assertRegularPlan(await getBillingPlan(plan.id), input.plan, input.interval, target.amountMinor); } catch { throw new MemberError('PayPal 方案核對失敗，草稿保留 / PayPal plan verification failed; draft retained', 503); }
    nextPolicy = { ...nextPolicy, subscriptions: { ...nextPolicy.subscriptions, [input.plan]: { ...nextPolicy.subscriptions[input.plan], [input.interval]: { ...target, paypalPlanId: plan.id } } } };
  }
  if (input.action === 'publish') {
    for (const plan of plans) for (const interval of periods) {
      const next = nextPolicy.subscriptions[plan][interval], old = live.policy.subscriptions[plan][interval];
      if (next.amountMinor !== old.amountMinor || next.paypalPlanId !== old.paypalPlanId) {
        if (!next.paypalPlanId) throw new MemberError('訂閱價格改動前，請先建立對應 PayPal 方案 / Prepare the matching PayPal plan before publishing a new subscription price', 409);
        const known = await resolveBillingPlan(next.paypalPlanId);
        if (known && (known.plan !== plan || known.interval !== interval || known.amountMinor !== next.amountMinor || known.promotion)) throw new MemberError('不可將舊 PayPal 方案改配其他價格或權益 / An existing PayPal plan cannot be reassigned', 409);
        try { assertRegularPlan(await getBillingPlan(next.paypalPlanId), plan, interval, next.amountMinor); } catch { throw new MemberError('PayPal 金額、幣別、週期或附加費不符，未發布 / PayPal price, currency, interval or fees do not match; not published', 409); }
      }
    }
  }
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    await adminLock(tx);
    const replay = await tx.setting.findUnique({ where: { key: receiptKey } });
    if (replay) { if ((replay.value as { hash?: string }).hash !== hash) throw conflict(); return; }
    const current = await readDraft(tx, live);
    if (current.revision !== input.revision) throw conflict();
    const now = new Date(), updatedAt = now.toISOString(), revision = current.revision + 1;
    if (input.action === 'publish') {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('novaCommerce.publish'))::text`;
      const before = await readPublished(tx);
      if (before.version !== live.version) throw conflict();
      let environment: 'live' | 'sandbox' | null = null; try { environment = getPaypalEnvironment(); } catch { }
      if (!environment && plans.some(p => periods.some(i => nextPolicy.subscriptions[p][i].amountMinor !== before.policy.subscriptions[p][i].amountMinor || nextPolicy.subscriptions[p][i].paypalPlanId !== before.policy.subscriptions[p][i].paypalPlanId))) throw new MemberError('PayPal 環境未設定 / PayPal environment is not configured', 503);
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
      const value: PublishedCommerce = { version: before.version + 1, policy: nextPolicy, previousMonthlyGrant: currentMonthlyGrant(before), grantStartsPeriod: nextMonth, publishedAt: updatedAt, publishedBy: actor, environment };
      for (const plan of plans) for (const interval of periods) {
        const item = nextPolicy.subscriptions[plan][interval];
        if (!item.paypalPlanId || !environment) continue;
        const key = commercePrefix + 'plan.' + item.paypalPlanId, row = await tx.setting.findUnique({ where: { key } }), snapshot = { plan, interval, amountMinor: item.amountMinor, environment };
        if (row && JSON.stringify(row.value) !== JSON.stringify(snapshot)) {
          const saved = row.value as typeof snapshot;
          if (saved.plan !== plan || saved.interval !== interval || saved.amountMinor !== item.amountMinor || saved.environment !== environment) throw conflict();
        }
        if (!row) await tx.setting.create({ data: { key, value: snapshot } });
      }
      if (before.version === 1) await tx.setting.create({ data: { key: commercePrefix + 'version.1', value: before as unknown as Prisma.InputJsonValue } });
      await tx.setting.create({ data: { key: commercePrefix + 'version.' + value.version, value: value as unknown as Prisma.InputJsonValue } });
      await tx.setting.upsert({ where: { key: publishedKey }, create: { key: publishedKey, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
    }
    const value = { revision, policy: nextPolicy, updatedAt, updatedBy: actor };
    await tx.setting.upsert({ where: { key: draftKey }, create: { key: draftKey, value: value as unknown as Prisma.InputJsonValue }, update: { value: value as unknown as Prisma.InputJsonValue } });
    await tx.setting.create({ data: { key: receiptKey, value: { hash, actor, action: input.action, revision, at: updatedAt } } });
  }, { timeout: 15000 });
  return commerceSettings();
}
