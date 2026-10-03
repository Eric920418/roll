import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
import { validReminderTime, validTimeZone } from "../src/lib/rewards/policy";
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  runInNewContext(source,{module:loaded,exports:loaded.exports,console,process,Buffer,URL,Request,Response,Error,require:(id:string)=>id in mocks?mocks[id]:require(id)});
  return loaded.exports as T;
}
class RewardError extends Error { constructor(message:string, public status=409,public code="reward_conflict"){super(message);} }
function harness() {
  const state={uid:"owner" as string|null, limited:false, visits:[] as string[], redemptions:[] as {uid:string;requestId:string}[], reminders:[] as unknown[], cronCalls:0};
  const api={unauthorized:()=>Response.json({error:"Login required"},{status:401}),failFromError:()=>Response.json({error:"Safe server failure"},{status:500})};
  const service={RewardError,claimVisit:async(uid:string)=>{state.visits.push(uid);},getRewardSummary:async()=>({balance:5}),redeemReward:async(uid:string,requestId:string)=>{state.redemptions.push({uid,requestId});return{id:"redemption",credits:5};}};
  const http=load<typeof import("../src/lib/rewards/http")>("src/lib/rewards/http.ts",{"@/lib/rewards/service":service,"./service":service,"@/lib/api":api});
  const mocks={"@/lib/api":api,"@/lib/auth/guard":{getUserSession:async()=>state.uid?{uid:state.uid}:null},"@/lib/rewards/service":service,"@/lib/rewards/http":http,"@/lib/rate-limit":{MINUTE_MS:60000,checkRateLimit:async()=>({ok:!state.limited})},"@/lib/rewards/reminders":{reminderSchema:z.object({enabled:z.boolean(),time:z.string().refine(validReminderTime),timeZone:z.string().refine(validTimeZone),locale:z.enum(["en","zh-tw"])}).strict(),saveReminder:async(uid:string,input:unknown)=>{state.reminders.push({uid,input});},runRewardReminders:async()=>{state.cronCalls++;return{disabled:true};}}};
  const visit=load<typeof import("../src/app/api/rewards/visit/route")>("src/app/api/rewards/visit/route.ts",mocks);
  const redeem=load<typeof import("../src/app/api/rewards/redeem/route")>("src/app/api/rewards/redeem/route.ts",mocks);
  const reminder=load<typeof import("../src/app/api/rewards/reminder/route")>("src/app/api/rewards/reminder/route.ts",mocks);
  const cron=load<typeof import("../src/app/api/cron/reward-reminders/route")>("src/app/api/cron/reward-reminders/route.ts",mocks);
  const request=(path:string,body?:unknown,origin:string|null="https://example.test")=>new Request(`https://example.test/api/rewards/${path}`,{method:path==="reminder"?"PATCH":"POST",headers:{...(origin?{Origin:origin}:{}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {state,visit,redeem,reminder,cron,request};
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
