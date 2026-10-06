import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
import { validReminderTime, validTimeZone } from "../src/lib/rewards/policy";
import * as rewardPolicy from "../src/lib/rewards/policy";
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  runInNewContext(source,{module:loaded,exports:loaded.exports,console,process,Buffer,URL,Request,Response,Error,require:(id:string)=>id in mocks?mocks[id]:require(id)});
  return loaded.exports as T;
}
class RewardError extends Error { constructor(message:string, public status=409,public code="reward_conflict"){super(message);} }
function harness() {
  const state={uid:"owner" as string|null, limited:false, visits:[] as string[], redemptions:[] as {uid:string;requestId:string}[], reminders:[] as unknown[], cronCalls:0,
    emailEnabled:true, nextReminderAt:new Date(0) as Date|null, nextAttemptAt:null as Date|null, scheduleReads:0, runFailure:false, invalidations:[] as string[]};
  const cache = new Map<string, unknown>();
  const cacheApi = {
    unstable_cache: (fn: () => Promise<unknown>, keys: string[]) => async () => {
      const key = keys.join(":"); if (!cache.has(key)) cache.set(key, await fn()); return cache.get(key);
    },
    revalidateTag: (tag: string, profile: { expire: number }) => { assert.equal(profile.expire, 0); state.invalidations.push(tag); cache.clear(); },
  };
  const api={unauthorized:()=>Response.json({error:"Login required"},{status:401}),failFromError:()=>Response.json({error:"Safe server failure"},{status:500})};
  const service={RewardError,claimVisit:async(uid:string)=>{state.visits.push(uid);},getRewardSummary:async()=>({balance:5}),redeemReward:async(uid:string,requestId:string)=>{state.redemptions.push({uid,requestId});return{id:"redemption",credits:5};}};
  const http=load<typeof import("../src/lib/rewards/http")>("src/lib/rewards/http.ts",{"@/lib/rewards/service":service,"./service":service,"@/lib/api":api});
  const mocks={"next/cache":cacheApi,"@/lib/rewards/policy":rewardPolicy,"@/lib/prisma":{prisma:{
    rewardReminder:{aggregate:async()=>{state.scheduleReads++;return{_min:{nextSendAt:state.nextReminderAt}};}},
    rewardDelivery:{aggregate:async()=>{state.scheduleReads++;return{_min:{nextAttemptAt:state.nextAttemptAt}};}},
  }},"@/lib/api":api,"@/lib/auth/guard":{getUserSession:async()=>state.uid?{uid:state.uid}:null},"@/lib/rewards/service":service,"@/lib/rewards/http":http,"@/lib/rate-limit":{MINUTE_MS:60000,checkRateLimit:async()=>({ok:!state.limited})},"@/lib/rewards/reminders":{reminderSchema:z.object({enabled:z.boolean(),time:z.string().refine(validReminderTime),timeZone:z.string().refine(validTimeZone),locale:z.enum(["en","zh-tw"])}).strict(),saveReminder:async(uid:string,input:unknown)=>{state.reminders.push({uid,input});state.nextReminderAt=new Date(0);},unsubscribeReminder:async()=>{state.nextReminderAt=null;state.nextAttemptAt=null;},rewardEmailConfigured:()=>state.emailEnabled,runRewardReminders:async()=>{state.cronCalls++;if(state.runFailure)throw new Error("Local test failure");state.nextReminderAt=new Date(Date.now()+86400000);state.nextAttemptAt=null;return{disabled:false,accepted:0,skipped:0,failed:0};}}};
  const visit=load<typeof import("../src/app/api/rewards/visit/route")>("src/app/api/rewards/visit/route.ts",mocks);
  const redeem=load<typeof import("../src/app/api/rewards/redeem/route")>("src/app/api/rewards/redeem/route.ts",mocks);
  const reminder=load<typeof import("../src/app/api/rewards/reminder/route")>("src/app/api/rewards/reminder/route.ts",mocks);
  const cron=load<typeof import("../src/app/api/cron/reward-reminders/route")>("src/app/api/cron/reward-reminders/route.ts",mocks);
  const unsubscribe=load<typeof import("../src/app/api/rewards/unsubscribe/route")>("src/app/api/rewards/unsubscribe/route.ts",mocks);
  const request=(path:string,body?:unknown,origin:string|null="https://example.test")=>new Request(`https://example.test/api/rewards/${path}`,{method:path==="reminder"?"PATCH":"POST",headers:{...(origin?{Origin:origin}:{}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {state,visit,redeem,reminder,cron,unsubscribe,request};
}
test("Reward writes require a logged-in owner and same Origin before any mutation",async()=>{
  const h=harness();h.state.uid=null;assert.equal((await h.visit.POST(h.request("visit"))).status,401);
  h.state.uid="owner";assert.equal((await h.visit.POST(h.request("visit",undefined,"https://evil.test"))).status,403);assert.equal((await h.visit.POST(h.request("visit",undefined,null))).status,403);assert.equal(h.state.visits.length,0);
  const response=await h.visit.POST(h.request("visit"));assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.deepEqual(h.state.visits,["owner"]);
});
test("Redeem validates UUID and strict input, enforces rate limits and takes ownership only from session",async()=>{
  const h=harness(),requestId="11111111-1111-4111-8111-111111111111";
  for(const body of [{},{requestId:"bad"},{requestId,userId:"victim"}])assert.equal((await h.redeem.POST(h.request("redeem",body))).status,400);
  assert.equal(h.state.redemptions.length,0);h.state.limited=true;assert.equal((await h.redeem.POST(h.request("redeem",{requestId}))).status,429);
  h.state.limited=false;assert.equal((await h.redeem.POST(h.request("redeem",{requestId}))).status,200);assert.deepEqual(h.state.redemptions,[{uid:"owner",requestId}]);
});
test("Reminder settings reject invalid time slots/timezones and unknown ownership fields",async()=>{
  const h=harness(),body={enabled:true,time:"09:00",timeZone:"Asia/Taipei",locale:"zh-tw"};
  for(const input of [{...body,time:"09:07"},{...body,timeZone:"bad"},{...body,userId:"victim"}])assert.equal((await h.reminder.PATCH(h.request("reminder",input))).status,400);
  assert.equal(h.state.reminders.length,0);assert.equal((await h.reminder.PATCH(h.request("reminder",body))).status,200);assert.equal(h.state.reminders.length,1);
});
test("Cron fails closed without a secret, with wrong/Unicode tokens, and accepts only the exact Bearer",async()=>{
  const h=harness(),original=process.env.CRON_SECRET;
  try{
    delete process.env.CRON_SECRET;assert.equal((await h.cron.GET(new Request("https://example.test/api/cron/reward-reminders"))).status,401);
    process.env.CRON_SECRET="local-test-secret";
    for(const header of ["Bearer wrong","é".repeat("Bearer local-test-secret".length)])assert.equal((await h.cron.GET(new Request("https://example.test/api/cron/reward-reminders",{headers:{Authorization:header}}))).status,401);
    assert.equal(h.state.cronCalls,0);assert.equal((await h.cron.GET(new Request("https://example.test/api/cron/reward-reminders",{headers:{Authorization:"Bearer local-test-secret"}}))).status,200);assert.equal(h.state.cronCalls,1);
  }finally{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;}
});

test("Idle reminder ticks reuse the cached empty schedule; settings and unsubscribe invalidate it",async()=>{
  const h=harness(),original=process.env.CRON_SECRET;
  const tick=()=>h.cron.GET(new Request("https://example.test/api/cron/reward-reminders",{headers:{Authorization:"Bearer local-test-secret"}}));
  try {
    process.env.CRON_SECRET="local-test-secret";h.state.nextReminderAt=null;
    for(let i=0;i<4;i++){const response=await tick();assert.equal(response.status,200);assert.equal((await response.json()).data.idle,true);}
    assert.equal(h.state.scheduleReads,2);assert.equal(h.state.cronCalls,0);
    assert.equal((await h.reminder.PATCH(h.request("reminder",{enabled:true,time:"09:00",timeZone:"Asia/Taipei",locale:"en"}))).status,200);
    await tick();assert.equal(h.state.cronCalls,1);assert.equal(h.state.scheduleReads,4);
    await tick();await tick();assert.equal(h.state.scheduleReads,6);assert.equal(h.state.cronCalls,1);
    assert.equal((await h.unsubscribe.POST(new Request("https://example.test/api/rewards/unsubscribe?token=local-test-token",{method:"POST"}))).status,200);
    await tick();assert.equal(h.state.scheduleReads,8);assert.equal(h.state.cronCalls,1);
    assert(h.state.invalidations.every(tag=>tag===rewardPolicy.REWARD_REMINDER_SCHEDULE_TAG));
  } finally {if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;}
});

test("Due outbox retries run even when the next reminder is in the future; failed runs invalidate",async()=>{
  const h=harness(),original=process.env.CRON_SECRET;
  const tick=()=>h.cron.GET(new Request("https://example.test/api/cron/reward-reminders",{headers:{Authorization:"Bearer local-test-secret"}}));
  try {
    process.env.CRON_SECRET="local-test-secret";h.state.nextReminderAt=new Date(Date.now()+86400000);h.state.nextAttemptAt=new Date(0);h.state.runFailure=true;
    assert.equal((await tick()).status,500);assert.equal(h.state.cronCalls,1);assert.equal(h.state.invalidations.length,1);
    h.state.runFailure=false;assert.equal((await tick()).status,200);assert.equal(h.state.cronCalls,2);assert.equal(h.state.scheduleReads,4);
    h.state.emailEnabled=false;await tick();assert.equal(h.state.scheduleReads,4);assert.equal(h.state.cronCalls,2);
  } finally {if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;}
});

// Raw request validation must run before coercion: null/empty values are not choice zero.
test("Quiz rejects null, blank, string, boolean and missing choices before any award", async () => {
  let transactions = 0;
  const api = { fail: (error: string, status: number) => Response.json({ error }, { status }), unauthorized: () => Response.json({}, { status: 401 }), failFromError: () => Response.json({}, { status: 500 }) };
  const route = load<typeof import("../src/app/api/playbooks/quiz/submit/route")>("src/app/api/playbooks/quiz/submit/route.ts", {
    "@/lib/api": api, "@/lib/auth/guard": { getUserSession: async () => ({ uid: "qa" }) },
    "@/lib/prisma": { prisma: { user: { findUnique: async () => ({ createdAt: new Date() }) } } },
    "@/lib/playbook/quiz": {}, "@/lib/rewards/policy": {},
    "@/lib/rewards/service": { rewardTransaction: async () => { transactions++; } },
  });
  for (const choice of [null, "", "0", false, undefined]) {
    const response = await route.POST(new Request("https://example.test/api/playbooks/quiz/submit", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: JSON.stringify({ answers: [{ questionId: "one", choice }] }) }) as never);
    assert.equal(response.status, 400);
  }
  assert.equal(transactions, 0);
});

test("Rewards recommendations omit the quiz while retaining real profile and Ready task actions", async () => {
  const source = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts", {
    "server-only": {}, "./policy": rewardPolicy, "@/lib/prisma": { prisma: {
      rewardEntry: { findUnique: async () => ({ id: "profile-claimed" }), findMany: async () => [] },
      playbookQuizAttempt: { findUnique: () => { throw new Error("Quiz is not a required next step"); } },
    } }, "@/lib/auth/account": {}, "@/lib/billing/gate": {},
    "@/lib/action-plan/service": { getActiveActionPlan: async () => ({ nextMoves: [
      { id: "ready", title: "Interview customers", done: false, dependency: { blocked: false } },
      { id: "blocked", title: "Pilot", done: false, dependency: { blocked: true } },
    ] }) },
    "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date("2026-10-16") },
  });
  const result = await source.rewardOpportunities("owner", true, new Date("2026-10-02"), null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.opportunities)), [{ kind: "action", href: "/dashboard/agenda#action-ready", points: 30, title: "Interview customers" }]);
  assert.equal((await source.rewardOpportunities("owner", false, new Date("2026-10-02"), null)).opportunities.length, 0);
});

test("Reminder branding uses the main absolute logo and keeps safe escaped links without sending email", () => {
  const old = { secret: process.env.AUTH_SECRET, url: process.env.NEXT_PUBLIC_APP_URL, from: process.env.RESEND_FROM_EMAIL };
  try {
    process.env.AUTH_SECRET = "local-test-secret"; process.env.NEXT_PUBLIC_APP_URL = "https://example.test"; process.env.RESEND_FROM_EMAIL = "NOVA AI <test@example.invalid>";
    const reminders = load<typeof import("../src/lib/rewards/reminders")>("src/lib/rewards/reminders.ts", {
      "server-only": {}, "./policy": rewardPolicy, "@/lib/prisma": {}, "@/lib/auth/account": {}, "@/lib/billing/plans": {}, "@/lib/billing/gate": {},
      "./service": { RewardError },
    });
    for (const locale of ["en", "zh-tw"]) {
      const payload = reminders.emailPayload("test@example.invalid", "owner", "11111111-1111-4111-8111-111111111111", locale, "action", "/dashboard/agenda#action-test", 30);
      assert.match(payload.html, /src="https:\/\/example\.test\/nova\/logo-metal\.png"/);
      assert.match(payload.html, /alt="NOVA AI"/);
      assert.doesNotMatch(payload.html, /letter-spacing:4px/);
      assert.match(payload.headers["List-Unsubscribe"], /example\.test\/api\/rewards\/unsubscribe/);
    }
  } finally {
    for (const [key, value] of [["AUTH_SECRET", old.secret], ["NEXT_PUBLIC_APP_URL", old.url], ["RESEND_FROM_EMAIL", old.from]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value; }
  }
});
