import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const native = createRequire(import.meta.url);
function loader(mocks: Record<string, unknown>, env: Record<string, string>, fetcher: typeof fetch) {
  const cache = new Map<string, { exports: unknown }>();
  function load<T>(file: string): T {
    const path = resolve(file); if (cache.has(path)) return cache.get(path)!.exports as T;
    const mod = { exports: {} }; cache.set(path, mod);
    runInNewContext(ts.transpileModule(readFileSync(path,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: mod, exports: mod.exports, process: { env, cwd: () => process.cwd() }, Date, Error, SyntaxError, URL, Request, Response, Headers, Buffer, AbortSignal, fetch: fetcher, setTimeout: (fn: () => void) => { fn(); }, console,
      require: (id: string) => id in mocks ? mocks[id] : id === "server-only" ? {} : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path),`${id}.ts`)) : native(id),
    }); return mod.exports as T;
  } return load;
}
const env = { REPORT_EMAIL_ENABLED: "true", RESEND_API_KEY: "report-secret", RESEND_FROM_EMAIL: "NOVA <reminders@rollgrp.com>", NEXT_PUBLIC_APP_URL: "https://rollon.com.tw" };
const noop = async () => new Response("{}", {status:500});
const pure = loader({ "@/lib/prisma": {}, "@/lib/member-http": { MemberError: class extends Error {} }, "@/lib/rewards/reminders": {}, "@/lib/newsletter/service": {}, "@/lib/security/log": {} }, env, noop)<typeof import("../src/lib/reports/service")>("src/lib/reports/service.ts");
function input() { return { requestId: randomUUID(), reportId: "taiwan-2026-q4" as const, name: "Report QA", email: "reader@gmail.com", company: "Real company", country: "TW", industry: "saas", reportLanguage: "en" as const, locale: "zh-tw" as const, subscribe: false, timeZone: "Asia/Taipei", website: "" }; }

test("Report input uses a real company, valid country, personal email and fixed language/file allowlist", () => {
  assert(pure.reportRequestSchema.safeParse(input()).success);
  for (const invalid of [{company:""},{country:"Taiwan"},{reportLanguage:"fr"},{reportId:"external-pdf"},{attachment:"https://evil.invalid/file"},{timeZone:"Not/AZone"}]) assert(!pure.reportRequestSchema.safeParse({...input(),...invalid}).success);
  for (const language of ["en","zh-tw"] as const) {
    const jobs = pure.reportPayloads({...input(),reportLanguage:language,name:"<script>"});
    assert.equal(jobs.length,2); assert.equal(jobs[0].payload.from,"ROLL ON <reminders@rollgrp.com>");
    const payload = jobs[0].payload; assert("attachments" in payload); assert(payload.attachments[0].path.endsWith(`-${language}.pdf`));
    assert(jobs[0].payload.text.includes(`-${language}.pdf`));
    assert.deepEqual(Array.from(jobs[1].payload.to),["vivian.lee@roll-grp.com"]);
  }
  for (const [language, hash] of [["en", "531730cf8336161f2a48984ed40c456622c9f70ddac6d30df0225900aed74ee2"], ["zh-tw", "e35bd88e1fa4d86c957cd8e51c27b60b87d835566426cd82b0d81397ea1eaf06"]]) assert.equal(createHash("sha256").update(readFileSync(`public/reports/taiwan-market-entry-q4-2026-${language}.pdf`)).digest("hex"), hash);
});

test("Report transactions, independent delivery retries, newsletter choice and private admin reads", {skip:!process.env.ROLL_REWARDS_TEST_DATABASE_URL}, async t => {
  const url=process.env.ROLL_REWARDS_TEST_DATABASE_URL!; assert(["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname)); assert(new URL(url).pathname.startsWith("/roll_rewards_qa"));
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})}), ids:string[]=[];
  let failNewsletter=false, newsletterCalls=0, admin=false, rollBack=false, failRecipient=false, failNotification=false;
  const posts: {key:string;body:string}[]=[];
  const wrapped=new Proxy(db, {get(target,key){if(key==="$transaction")return async(fn:(tx:unknown)=>unknown)=>target.$transaction(async tx=>fn(new Proxy(tx,{get(obj,k){if(k==="marketReportRequest")return new Proxy(obj.marketReportRequest,{get(model,op){if(op==="create")return async(args:Parameters<typeof model.create>[0])=>{const row=await model.create(args);if(rollBack)throw new Error("forced write rollback");return row;};return Reflect.get(model,op);}});return Reflect.get(obj,k);}})));return Reflect.get(target,key);}});
  const load=loader({"@/lib/prisma":{prisma:wrapped},"@/lib/newsletter/service":{signupNewsletter:async(body:{company:string})=>{assert.equal(body.company,"");newsletterCalls++;if(failNewsletter)throw new Error("secret-internal-failure");return {accepted:true};}},"@/lib/security/log":{logSecurityError:()=>"report-qa",publicErrorMessage:()=>"訂閱服務暫時失敗 / Retry subscription (report-qa)"},"@/lib/auth/guard":{requireAdmin:async()=>admin?{}:null},"@/lib/rate-limit":{DAY_MS:86400000,MINUTE_MS:60000,checkRateLimit:async()=>({ok:true}),clientIp:()=>"127.0.0.1"},"next/server":{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}}},env,async(_url,init)=>{const key=new Headers(init?.headers).get("Idempotency-Key")!,body=String(init?.body);posts.push({key,body});const p=JSON.parse(body);if(p.to[0]==="vivian.lee@roll-grp.com"?failNotification:failRecipient)return Response.json({error:"private provider detail"},{status:503});return Response.json({id:"receipt-"+key});});
  const svc=load<typeof import("../src/lib/reports/service")>("src/lib/reports/service.ts"),api=load<typeof import("../src/app/api/reports/requests/route")>("src/app/api/reports/requests/route.ts"),list=load<typeof import("../src/app/api/admin/reports/requests/route")>("src/app/api/admin/reports/requests/route.ts");
  const make=()=>{const i=input();ids.push(i.requestId);return i;};
  const request=(data:unknown,origin="https://rollon.com.tw")=>new Request("https://rollon.com.tw/api/reports/requests",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(data)});
  try {
    await t.test("Origin, schema and honeypot reject writes; a real company is retained",async()=>{const i=make();assert.equal((await api.POST(request(i,"https://evil.invalid"))).status,403);assert.equal((await api.POST(request({...i,country:"invalid"}))).status,400);assert.equal((await api.POST(request({...i,website:"bot"}))).status,200);assert.equal(await db.marketReportRequest.count({where:{requestId:i.requestId}}),0);await svc.createReportRequest(i);assert.equal((await db.marketReportRequest.findUnique({where:{requestId:i.requestId}}))?.company,i.company);});
    await t.test("Concurrent replay creates one request and exactly one email per recipient",async()=>{const i=make(),before=posts.length;await Promise.all([svc.createReportRequest(i),svc.createReportRequest(i),svc.createReportRequest(i)]);assert.equal(await db.marketReportRequest.count({where:{requestId:i.requestId}}),1);const row=await db.marketReportRequest.findUniqueOrThrow({where:{requestId:i.requestId},include:{deliveries:true}});assert.equal(row.deliveries.length,2);assert(row.deliveries.every(v=>v.status==="accepted"&&v.attempts===1));assert.equal(posts.length-before,2);assert.equal(newsletterCalls,0);await assert.rejects(svc.createReportRequest({...i,company:"Changed"}),/content changed|內容已變更/);});
    await t.test("Write failure rolls back the request and both delivery events",async()=>{const i=make();rollBack=true;await assert.rejects(svc.createReportRequest(i),/rollback/);rollBack=false;assert.equal(await db.marketReportRequest.count({where:{requestId:i.requestId}}),0);});
    await t.test("Recipient failure does not resend the accepted internal notification; retries preserve bytes and key",async()=>{const i=make();failRecipient=true;const first=await svc.createReportRequest(i);assert.equal(first.delivery,"pending");const row=await db.marketReportRequest.findUniqueOrThrow({where:{requestId:i.requestId},include:{deliveries:true}}),job=row.deliveries.find(v=>v.kind==="report")!;failRecipient=false;const before=posts.length;await Promise.all([svc.runReportDeliveries(new Date(Date.now()+16*60000),60000,row.id),svc.runReportDeliveries(new Date(Date.now()+16*60000),60000,row.id)]);assert.equal(posts.length-before,1);const tries=posts.filter(p=>p.key.endsWith(job.id));assert.equal(tries.length,2);assert.equal(tries[0].body,tries[1].body);assert.equal((await db.marketReportDelivery.findUniqueOrThrow({where:{id:job.id}})).attempts,2);});
    await t.test("Three failures or 24 hours stop retries; opt-in failure never rolls back the report",async()=>{const i=make();failNotification=true;await svc.createReportRequest(i);const row=await db.marketReportRequest.findUniqueOrThrow({where:{requestId:i.requestId}});await svc.runReportDeliveries(new Date(Date.now()+16*60000),60000,row.id);await svc.runReportDeliveries(new Date(Date.now()+32*60000),60000,row.id);const before=posts.length;await svc.runReportDeliveries(new Date(Date.now()+48*60000),60000,row.id);assert.equal(posts.length,before);const job=await db.marketReportDelivery.findFirstOrThrow({where:{requestId:row.id,kind:"notification"}});assert.equal(job.status,"failed");assert.equal(job.attempts,3);failNotification=false;const subscribed=make();failNewsletter=true;const result=await svc.createReportRequest({...subscribed,subscribe:true});assert.equal(result.delivery,"accepted");assert.equal(result.newsletterStatus,"failed");assert(!result.newsletterError?.includes("secret-internal"));assert.equal(newsletterCalls,1);failNewsletter=false;const retry=await svc.createReportRequest({...subscribed,subscribe:true});assert.equal(retry.newsletterStatus,"queued");const expired=make();failRecipient=true;await svc.createReportRequest(expired);failRecipient=false;const expiredRow=await db.marketReportRequest.findUniqueOrThrow({where:{requestId:expired.requestId}});const count=posts.length;await svc.runReportDeliveries(new Date(Date.now()+25*3600000),60000,expiredRow.id);assert.equal(posts.length,count);});
    await t.test("Admin endpoint rejects anonymous reads and omits payload and idempotency hashes",async()=>{assert.equal((await list.GET(new Request("https://rollon.com.tw/api/admin/reports/requests"))).status,401);admin=true;const response=await list.GET(new Request("https://rollon.com.tw/api/admin/reports/requests"));assert.equal(response.status,200);const text=await response.text();assert(!text.includes("payload")&&!text.includes("requestHash")&&!text.includes("report-secret"));});
  } finally {const rows=await db.marketReportRequest.findMany({where:{requestId:{in:ids}},select:{id:true}});await db.marketReportDelivery.deleteMany({where:{requestId:{in:rows.map(r=>r.id)}}});await db.marketReportRequest.deleteMany({where:{requestId:{in:ids}}});await db.$disconnect();}
});
