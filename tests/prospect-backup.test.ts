import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const native = createRequire(import.meta.url);
function loader(mocks: Record<string, unknown>, env: Record<string, string> = {}) {
  const cache = new Map<string, { exports: unknown }>();
  function load<T>(file: string): T {
    const path = resolve(file); if (cache.has(path)) return cache.get(path)!.exports as T;
    const mod = { exports: {} }; cache.set(path, mod);
    runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, Date, Error, Response, Request, Headers, URL, Buffer, AbortSignal, console, setTimeout, clearTimeout, process: { env }, require: (id: string) => id === 'server-only' ? {} : id in mocks ? mocks[id] : id.startsWith('@/') ? load(`src/${id.slice(2)}.ts`) : id.startsWith('.') ? load(resolve(dirname(path), `${id}.ts`)) : native(id) });
    return mod.exports as T;
  }
  return load;
}
const env = () => ({ ANTHROPIC_API_KEY: 'mock-not-a-key', PROSPECT_AI_BACKUP_UNTIL: new Date(Date.now() + 3600000).toISOString() });
const moduleFor = (environment: Record<string, string> = env()) => loader({}, environment)<typeof import('../src/lib/prospecting/backup')>('src/lib/prospecting/backup.ts');
const candidate = (n = 0) => ({ name: `Buyer ${n}`, website: `https://buyer${n}.example.com`, countrySource: { url: `https://buyer${n}.example.com/about`, quote: 'Our office is in Taipei, Taiwan.' }, fitSource: { url: `https://buyer${n}.example.com/about`, quote: 'We develop B2B inventory software.' }, reason: 'B2B software operations; buying intent is unknown', contactUrl: `https://buyer${n}.example.com/contact`, email: null });
const publicRead = async (url: string) => ({ url, html: '<p>Our office is in Taipei, Taiwan.</p><p>We develop B2B inventory software.</p><form><textarea name="message"></textarea></form>' });
test('AI backup is off without an explicit, valid, unexpired UTC deadline and usable key', () => {
  for (const value of ([{}, { PROSPECT_AI_BACKUP_UNTIL: 'tomorrow' }, { ...env(), PROSPECT_AI_BACKUP_UNTIL: '2026-01-01T00:00:00Z' }, { ...env(), ANTHROPIC_API_KEY: '' }] as Record<string, string>[])) assert.equal(moduleFor(value).backupEnabled(), false);
  assert.equal(moduleFor().backupEnabled(), true);
  const mod = moduleFor();
  const request = { provider: mod.backupProvider, model: mod.backupModel, campaign: env().PROSPECT_AI_BACKUP_UNTIL, costMicros: mod.backupHoldMicros };
  const usage = mod.backupUsage([{ providerRequest: request }, { providerRequest: { ...request, costMicros: 50000 } }, { providerRequest: { max_charge_cents: 0 } }]);
  assert.equal(usage.attempts, 2); assert.equal(usage.committedMicros, 3050000);
  const validation=mod.backupUsage([{providerRequest:{...request,validation:true}}]);assert.equal(validation.attempts,0);assert.equal(validation.validations,1);assert.equal(validation.committedMicros,3000000);
});
test('Archived QA research stays in the money cap after account cleanup; malformed archives fail closed', async () => {
  const mod=moduleFor(), request={provider:mod.backupProvider,model:mod.backupModel,campaign:env().PROSPECT_AI_BACKUP_UNTIL,costMicros:547497,validation:true};
  const db={prospectingOrder:{findMany:async()=>[]},setting:{findUnique:async()=>({value:[{id:randomUUID(),request}]})}};
  const usage=mod.backupUsage(await mod.backupOrders(db as never));assert.equal(usage.attempts,0);assert.equal(usage.validations,1);assert.equal(usage.committedMicros,547497);
  await assert.rejects(mod.backupOrders({...db,setting:{findUnique:async()=>({value:[{id:randomUUID(),request:{...request,costMicros:-1}}]})}} as never),/budget record is invalid/);
});
test('AI results need searched official sources, exact actual quotes, correct country and public contact verification', async () => {
  const mod = moduleFor(), c = candidate();
  const first=await mod.groundedBackupCandidates({ companies: [c] }, [c.website], 'TW', publicRead);
  assert.equal(first.length,1);assert.equal((await mod.groundedBackupCandidates({companies:[c]},[c.website],'TW',publicRead))[0].company_id,first[0].company_id,'Rechecking must retain company identity');
  assert.equal((await mod.groundedBackupCandidates({ companies: [c] }, [], 'TW', publicRead)).length, 0);
  assert.equal((await mod.groundedBackupCandidates({ companies: [c] }, [c.website], 'US', publicRead)).length, 0);
  assert.equal((await mod.groundedBackupCandidates({ companies: [{ ...c, fitSource: { ...c.fitSource, quote: 'Invented business needs and willingness to pay' } }] }, [c.website], 'TW', publicRead)).length, 0);
  assert.equal((await mod.groundedBackupCandidates({ companies: [{ ...c, countrySource: { ...c.countrySource, url: 'https://directory.example.com/company' } }] }, [c.website], 'TW', publicRead)).length, 0);
  assert.equal((await mod.groundedBackupCandidates({ companies: [{ ...c, website: 'https://127.0.0.1' }] }, [c.website], 'TW', publicRead)).length,0);
  assert.equal((await mod.groundedBackupCandidates({companies:[{...c,website:'https://127.0.0.1'},c]},[c.website],'TW',publicRead)).length,1,'One invalid candidate cannot discard valid companies');
});
test('Bounded AI search has no SDK retry or fetch/code tools; no search sources means no generated companies', async () => {
  const calls: Record<string, unknown>[] = [], costs: number[] = [];
  class Fake { messages = { create: async (params: Record<string, unknown>) => { calls.push(params); return { content: [{ type: 'tool_use', name: 'recommend_companies', input: { companies: [candidate()] } }], usage: { input_tokens: 10000, output_tokens: 1000, server_tool_use: { web_search_requests: 4 } }, _request_id: 'safe-request' }; } }; constructor(options: { maxRetries: number; timeout: number }) { assert.equal(options.maxRetries, 0); assert.equal(options.timeout, 65000); } }
  const mod = loader({ '@anthropic-ai/sdk': Fake }, env())<typeof import('../src/lib/prospecting/backup')>('src/lib/prospecting/backup.ts');
  const result = await mod.researchBackup('Confirmed target buyers', 'TW', ['known.example.com'], async cost => { costs.push(cost); });
  assert.equal(calls.length, 1); assert.equal(result.raw.companies.length, 0); assert.equal(costs[0], 41500);
  const tools = calls[0].tools as { type?: string; max_uses?: number }[];
  assert.equal(tools[0].max_uses, 4); assert.equal(tools.length, 2); assert.equal(calls[0].model, 'claude-haiku-5-5');
});
test('Published official homepage inbox is usable without a guessed contact URL or named person', async () => {
  const mod = moduleFor(), c=candidate(); const [raw]=await mod.groundedBackupCandidates({companies:[c]},[c.website],'TW',publicRead);
  const contact=loader({},env())<typeof import('../src/lib/prospecting/contact')>('src/lib/prospecting/contact.ts');
  const result=await contact.verifyCompany({...raw,contacts:{people:[],emails:[],contact_pages:[]}},'TW',async url=>({url,html:'<p>B2B software in Taipei</p><a href="mailto:hello@buyer0.example.com">Email us</a>'}));
  assert.equal(result.company?.contact.kind,'email'); assert.equal(result.company?.contact.name,null);
  assert.equal((await contact.verifyCompany({...raw,contacts:{people:[],emails:[],contact_pages:[]}},'TW',async url=>({url,html:'privacy@buyer0.example.com jobs@buyer0.example.com'}))).company,undefined);
});
test('Real business inquiry forms do not need a free-text message; newsletters still do not qualify', async () => {
  const backup=moduleFor(), c=candidate();const [raw]=await backup.groundedBackupCandidates({companies:[c]},[c.website],'TW',publicRead);
  const mod=loader({},env())<typeof import('../src/lib/prospecting/contact')>('src/lib/prospecting/contact.ts');
  const read=async(url:string)=>({url,html:'<p>Business software</p><form id="business-contact"><input name="Company-Name_contactpage"><input type="email"><input type="submit" value="Contact sales"></form>'});
  assert.equal((await mod.verifyCompany(raw,'TW',read)).company?.contact.kind,'page');
  assert.equal((await mod.verifyCompany(raw,'TW',async url=>({url,html:'<p>Business software</p><form id="newsletter"><input name="company"><input type="email"><input type="submit" value="Subscribe"></form>'}))).company,undefined);
});
test('Durable backup queue: ownership, consent, one attempt, money holds, interruption and Token refunds', { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname.startsWith('/roll_rewards_qa'));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 8 }) }), ids: string[] = [], settings = env();
  let searches = 0, mode = 'ok';
  const realBackup = moduleFor(settings);
  const read = loader({}, settings)<typeof import('../src/lib/prospecting/contact')>('src/lib/prospecting/contact.ts');
  const mocks = { '@/lib/prisma': { prisma: db }, '@/lib/prospecting/schedule': { invalidateProspectingSchedule() {} }, '@/lib/network/access': { features: async () => ({ prospects: true }), networkAccount: async () => ({ effectivePlan: "business" }) }, './backup': { ...realBackup, researchBackup: async (_d: string, _c: string, _x: string[], meter: (cost: number) => Promise<void>) => { searches++; if (mode === 'timeout') throw new Error('secret must not reach API'); await meter(50000); return { raw: { companies: Array.from({length: mode === 'partial' ? 2 : 5}, (_, n) => candidate(n)) }, urls: Array.from({length: 5}, (_, n) => candidate(n).website), costMicros: 50000 }; }, groundedBackupCandidates: (raw: unknown, urls: string[], country: string) => realBackup.groundedBackupCandidates(raw, urls, country, publicRead) }, './contact': { verifyCompany: (raw: unknown, country: string) => read.verifyCompany(raw, country, publicRead) } };
  const load = loader(mocks, settings);
  const service = load<typeof import('../src/lib/prospecting/service')>('src/lib/prospecting/service.ts'), worker = load<typeof import('../src/lib/prospecting/worker')>('src/lib/prospecting/worker.ts');
  async function user() { const u = await db.user.create({ data: { email: `backup-${randomUUID()}@example.invalid`, plan: 'business' } }); ids.push(u.id); return u.id; }
  const body = (requestId = randomUUID()) => ({ provider: 'anthropic_backup' as const, requestId, pricingVersion: 1, revision: 0, country: 'TW', description: 'B2B inventory software startups in Taiwan', count: 5 as const });
  try {
    await t.test('Stale Omrade consent never silently becomes AI; duplicate tabs retain original order', async () => {
      const uid = await user(), b = body();
      await assert.rejects(service.createProspectOrder(uid, { ...b, provider: 'omrade' }), /provider changed/);
      const order = await service.createProspectOrder(uid, b);
      assert.equal((await service.createProspectOrder(uid, b)).id, order.id);
      await assert.rejects(service.getProspectOrder(await user(), order.id), /not found/);
      await worker.runProspecting(uid); assert.equal(searches, 1); assert.equal((await db.prospectingOrder.findUniqueOrThrow({where:{id:order.id}})).status, 'checking');
      await worker.runProspecting(uid); const done = await service.getProspectOrder(uid, order.id);
      assert.equal(done.usable, 5); assert.equal(done.tokenFee?.status, 'captured');
      await worker.runProspecting(uid); assert.equal(searches, 1);
      await assert.rejects(service.createProspectOrder(uid, { ...body(), revision: 1 }), /once per account/);
      await db.contact.create({data:{userId:uid,name:'Buyer contact',company:'Buyer 0'}});
      assert.equal((await service.getProspectOrder(uid,order.id)).usable,4);
      await worker.recheckProspectOrder(uid,order.id); assert.equal((await service.getProspectOrder(uid,order.id)).tokenFee?.status,'captured'); assert.equal(searches,1);
    });
    await t.test('Insufficient verified results release member Tokens but not platform research spend', async () => {
      mode = 'partial'; const uid = await user(), order = await service.createProspectOrder(uid,body());
      await worker.runProspecting(uid); await worker.runProspecting(uid);
      const done = await service.getProspectOrder(uid,order.id); assert.equal(done.usable,2); assert.equal(done.tokenFee?.status,'released');
      assert.equal(realBackup.backupUsage(await realBackup.backupOrders(db as never)).committedMicros,100000);
    });
    await t.test('Timeout retains conservative money hold and is never sent again; safe error and Token refund', async () => {
      mode='timeout'; const uid = await user(), order = await service.createProspectOrder(uid,body()); await worker.runProspecting(uid);
      const done = await service.getProspectOrder(uid,order.id); assert.equal(done.status,'failed'); assert.equal(done.tokenFee?.status,'released'); assert(!done.error?.includes('secret'));
      const before = searches; await worker.runProspecting(uid); assert.equal(searches,before);
      assert.equal(realBackup.backupUsage(await realBackup.backupOrders(db as never)).committedMicros,3100000);
      await assert.rejects(service.createProspectOrder(await user(),body()), /safety budget/);
    });
    await t.test('A paid request interrupted before save is refunded without another paid call', async () => {
      const uid = await user();
      // Isolate the next scenario from prior deliberately uncertain holds.
      await db.prospectingOrder.updateMany({where:{userId:{in:ids}},data:{providerRequest:{provider:'omrade'}}});
      const order = await service.createProspectOrder(uid,body()); const original=await db.prospectingOrder.findUniqueOrThrow({where:{id:order.id}});
      await db.prospectingOrder.update({where:{id:order.id},data:{submittedAt:new Date(),status:'running',providerRequest:{...(original.providerRequest as object),costMicros:3000000}}});
      const before=searches; await worker.runProspecting(uid); assert.equal(searches,before); assert.equal((await service.getProspectOrder(uid,order.id)).tokenFee?.status,'released');
    });
    await t.test('Concurrent admissions cannot exceed 20 or allow two orders for one account', async () => {
      await db.prospectingOrder.updateMany({where:{userId:{in:ids}},data:{providerRequest:{provider:'omrade'}}});
      const uid=await user(), admitted=await Promise.allSettled([service.createProspectOrder(uid,body()),service.createProspectOrder(uid,body())]); assert.equal(admitted.filter(x=>x.status==='fulfilled').length,1);
      const members=await Promise.all(Array.from({length:20},()=>user()));
      const results=await Promise.allSettled(members.map(id=>service.createProspectOrder(id,body()))); assert.equal(results.filter(x=>x.status==='fulfilled').length,19);
      assert.equal((await realBackup.backupOrders(db as never)).length,20);
    });
  } finally { await db.user.deleteMany({where:{id:{in:ids}}}); await db.$disconnect(); }
});
