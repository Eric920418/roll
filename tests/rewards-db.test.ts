import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as policy from "../src/lib/rewards/policy";
import { monthlyCycle } from "../src/lib/ai/allowance-cycle";

function load<T>(path: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: loaded, exports: loaded.exports, console, process, Date, Error, Buffer, Response, URL, AbortSignal, setTimeout, ...globals, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}
const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Rewards integration in isolated PostgreSQL", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"), "Use an isolated loopback QA database, never Production");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const ids: string[] = [];
  let currentUser = "", opportunities = [{ kind: "profile", href: "/dashboard/profile", points: 50 }];
  let activePlan: { nextMoves: { id: string; title: string; done: boolean; dependency: { blocked: boolean } }[] } | null = null;
  const quizBank = [{ id: "one", options: ["a","b"], answerIndex: 0 }, { id: "two", options: ["a","b"], answerIndex: 1 }];
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getCurrentAccount: async () => db.user.findUnique({ where: { id: currentUser }, include: { profile: true } }), getBetaAccess: async () => false },
    "@/lib/billing/gate": { getEffectivePlan: (account: { plan: string }) => account.plan },
    "@/lib/action-plan/service": { getActiveActionPlan: async () => activePlan },
    "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date(Date.now()+86400000), selectForPeriod: () => quizBank, scoreAttempt: (_bank: unknown, answers: { questionId: string; choice: number }[]) => ({ score: 2, total: 2, results: answers }) },
    "./policy": policy,
  };
  const service = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts", mocks);
  const user = async (complete = false) => {
    const u = await db.user.create({ data: { email: `${randomUUID()}@rewards.invalid`, ...(complete ? { profile: { create: { companyName: "QA", industry: "SaaS", country: "TW", oneLinePitch: "Testing", companyStage: "MVP", primaryNeed: "product-validation", targetMarkets: [], needs: [] } } } : {}) } }); ids.push(u.id); return u;
  };
  const award = (uid: string, kind: "action" | "quiz" | "profile", source: string, now?: Date) => service.rewardTransaction(tx => service.awardReward(tx, uid, kind, source, now));
  const wallet = async (uid: string) => (await db.rewardAccount.findUniqueOrThrow({ where: { userId: uid } })).balance;
  try {
    await t.test("Concurrent Home visits are idempotent; complete profile earns exactly once", async () => {
      const u = await user(true);
      await service.claimVisit(u.id);
      await Promise.all(Array.from({ length: 3 }, () => service.claimVisit(u.id)));
      assert.equal(await wallet(u.id), 55); assert.equal(await db.rewardEntry.count({ where: { userId: u.id } }), 2);
      await service.rewardTransaction(tx => service.awardProfile(tx,u.id)); assert.equal(await wallet(u.id),55);
    });
    await t.test("Daily action cap and lifetime task deduplication survive the next day and task removal", async () => {
      const u = await user(), now = new Date("2026-10-03T06:00:00Z");
      await award(u.id,"action","a",now); await award(u.id,"action","b",now); await award(u.id,"action","c",now);
      assert.equal(await wallet(u.id),60);
      assert.equal((await db.rewardEntry.findUniqueOrThrow({ where: { userId_eventKey: { userId:u.id,eventKey:"action:c" } } })).points,0);
      await award(u.id,"action","a",new Date("2026-10-04T06:00:00Z")); await award(u.id,"action","c",new Date("2026-10-04T06:00:00Z"));
      assert.equal(await wallet(u.id),60);
      await award(u.id,"action","d",new Date("2026-10-04T06:00:00Z")); assert.equal(await wallet(u.id),90);
    });
    await t.test("Today's opportunities only list the remaining rewardable task count", async () => {
      const u = await user();
      activePlan = { nextMoves: ["a", "b", "c"].map(id => ({ id, title: id, done: false, dependency: { blocked: false } })) };
      try {
        await award(u.id, "action", "previous");
        assert.equal((await service.rewardOpportunities(u.id, true, u.createdAt, null)).opportunities.filter(item => item.kind === "action").length, 1);
        await award(u.id, "action", "another");
        assert.equal((await service.rewardOpportunities(u.id, true, u.createdAt, null)).opportunities.filter(item => item.kind === "action").length, 0);
      } finally { activePlan = null; }
    });
    await t.test("Historical completed tasks cannot earn after undo, and ledger survives source deletion", async () => {
      const u=await user();
      const plan=await db.actionPlan.create({ data: { userId:u.id,locale:"en",companyStage:"MVP",stageReason:"QA",stageConfidence:80,bottleneckGroup:"Sales",bottleneckCode:"no_leads",bottleneckReason:"QA",bottleneckConfidence:80,requestId:randomUUID(),activeKey:u.id } });
      const task=await db.actionItem.create({ data: { actionPlanId:plan.id,clientKey:"old",title:"Old completed",impact:"revenue",urgencyType:"anytime",difficulty:1,actionTimeMinHours:1,actionTimeMaxHours:1,companyStage:"MVP",stageFit:1,stageFitReason:"QA",bottleneckGroup:"Sales",bottleneckCode:"no_leads",bottleneckFit:1,bottleneckFitReason:"QA",outcomeCategory:"sales",expectedOutcome:"QA",outcomeTimeMinDays:1,outcomeTimeMaxDays:1,done:true } });
      await service.claimVisit(u.id); await db.actionItem.update({where:{id:task.id},data:{done:false}}); await award(u.id,"action",task.id);
      assert.equal(await wallet(u.id),5); await db.actionItem.delete({where:{id:task.id}});
      assert(await db.rewardEntry.findUnique({where:{userId_eventKey:{userId:u.id,eventKey:`action:${task.id}`}}}));
    });
    await t.test("Concurrent redemption cannot overspend, replay never doubles credits, failed transactions roll back", async () => {
      const u=await user(); await award(u.id,"profile","complete"); await award(u.id,"quiz","0");
      const requestId=randomUUID(); const results=await Promise.allSettled([service.redeemReward(u.id,requestId),service.redeemReward(u.id,randomUUID())]);
      assert.equal(results.filter(r=>r.status==="fulfilled").length,1); assert.equal(await wallet(u.id),0);
      const redemption=await db.rewardRedemption.findFirstOrThrow({where:{userId:u.id}}); await service.redeemReward(u.id,redemption.requestId);
      currentUser=u.id; assert.equal((await service.getRewardSummary(undefined,redemption.requestId)).confirmedRedemptionRequestId,redemption.requestId);
      const other=await user(); currentUser=other.id; assert.equal((await service.getRewardSummary(undefined,redemption.requestId)).confirmedRedemptionRequestId,null);
      assert.equal((await db.aiAllowance.findUniqueOrThrow({where:{userId:u.id}})).rewardBalance,5); assert.equal(await db.rewardRedemption.count({where:{userId:u.id}}),1);
      await assert.rejects(service.rewardTransaction(async tx=>{ await service.awardReward(tx,u.id,"quiz","rollback"); throw new Error("forced rollback"); }),/forced rollback/);
      assert.equal(await wallet(u.id),0); assert.equal(await db.rewardEntry.count({where:{userId:u.id,eventKey:"quiz:rollback"}}),0);
    });
    await t.test("Monthly redemption limit leaves balances and existing purchased credits intact", async () => {
      const u=await user(); await service.claimVisit(u.id);
      await db.rewardAccount.update({where:{userId:u.id},data:{balance:1000}}); await db.aiAllowance.create({data:{userId:u.id,bonusBalance:9}});
      for(let i=0;i<4;i++) await service.redeemReward(u.id,randomUUID());
      await assert.rejects(service.redeemReward(u.id,randomUUID()),/20/); assert.equal(await wallet(u.id),600);
      const allowance=await db.aiAllowance.findUniqueOrThrow({where:{userId:u.id}}); assert.equal(allowance.rewardBalance,20); assert.equal(allowance.bonusBalance,9);
    });
    const ai=load<typeof import("../src/lib/ai/allowance")>("src/lib/ai/allowance.ts", { ...mocks, "./allowance-cycle":{monthlyCycle} });
    await t.test("Free AI cannot consume purchased/monthly credits; only Copilot can reserve rewards; refunds keep their source",async()=>{
      const u=await user(); await db.aiAllowance.create({data:{userId:u.id,rewardBalance:2,bonusBalance:7}});
      const account=u as unknown as Parameters<typeof ai.reserveAiUsage>[0];
      assert.equal(await ai.reserveAiUsage(account),null);
      const id=await ai.reserveAiUsage(account,"copilot"); assert(id); await ai.completeAiUsage(id,false); await ai.completeAiUsage(id,false);
      let summary=await ai.getAiUsageSummary(account); assert.equal(summary!.included,0); assert.equal(summary!.resetsAt,null); assert.equal(summary!.bonusRemaining,0); assert.equal(summary!.rewardRemaining,2);
      const expired=await ai.reserveAiUsage(account,"copilot"); assert(expired); await db.aiUsage.update({where:{id:expired},data:{expiresAt:new Date(Date.now()-1000)}});
      summary=await ai.getAiUsageSummary(account); assert.equal(summary!.rewardRemaining,2);
      const paid={...account,plan:"pro" as const,planUpdatedAt:new Date()};
      await ai.reserveAiUsage(paid); const state=await db.aiAllowance.findUniqueOrThrow({where:{userId:u.id}}); assert.equal(state.includedReserved,1); assert.equal(state.rewardBalance,2); assert.equal(state.bonusBalance,7);
      await db.aiAllowance.update({where:{userId:u.id},data:{includedUsed:150,includedReserved:0}});
      const rewardUsage=await ai.reserveAiUsage(paid); assert(rewardUsage); assert.equal((await db.aiUsage.findUniqueOrThrow({where:{id:rewardUsage}})).source,"reward");
    });
    await t.test("Quiz rejects partial input, races create one attempt and one reward, replay preserves original answers",async()=>{
      const u=await user(); currentUser=u.id;
      const route=load<typeof import("../src/app/api/playbooks/quiz/submit/route")>("src/app/api/playbooks/quiz/submit/route.ts",{...mocks,"@/lib/rewards/service":service,"@/lib/rewards/policy":policy,"@/lib/auth/guard":{getUserSession:async()=>({uid:u.id})},"@/lib/api":{ok:(data:unknown)=>Response.json({data}),fail:(error:string,status=400)=>Response.json({error},{status}),unauthorized:()=>Response.json({},{status:401}),failFromError:()=>Response.json({},{status:500})}});
      const post=(answers:unknown[])=>route.POST({url:"https://example.test/api/playbooks/quiz/submit",headers:new Headers({Origin:"https://example.test","Content-Type":"application/json"}),json:async()=>({answers})} as never);
      assert.equal((await post([])).status,400); assert.equal(await db.playbookQuizAttempt.count({where:{userId:u.id}}),0);
      const answers=[{questionId:"one",choice:0},{questionId:"two",choice:1}];
      const responses=await Promise.all([post(answers),post(answers)]); assert(responses.every(r=>r.status===200));
      assert.equal(await db.playbookQuizAttempt.count({where:{userId:u.id}}),1); assert.equal(await wallet(u.id),50);
      assert.equal((await post([])).status,200); assert.equal(await wallet(u.id),50);
    });
    const previousEnv={...process.env};
    process.env.REWARD_EMAIL_ENABLED="true"; process.env.RESEND_API_KEY="re_qa_secret";process.env.RESEND_FROM_EMAIL="NOVA <qa@example.invalid>";process.env.CRON_SECRET="qa-cron-secret";process.env.AUTH_SECRET="qa-signing-secret";process.env.NEXT_PUBLIC_APP_URL="https://example.invalid";
    let calls=0, failSend=false; const payloads:string[]=[],keys:string[]=[];
    let duringSendWait: (() => Promise<unknown>) | null = null;
    const reminderMocks={...mocks,"./service":{...service,rewardOpportunities:async()=>({opportunities})},"./policy":policy};
    const reminders=load<typeof import("../src/lib/rewards/reminders")>("src/lib/rewards/reminders.ts",reminderMocks,{fetch:async(_url:unknown,input:RequestInit)=>{calls++;payloads.push(String(input.body));keys.push((input.headers as Record<string,string>)["Idempotency-Key"]);return failSend?Response.json({message:"temporary re_qa_secret failure"},{status:503}):Response.json({id:`qa-${calls}`});},setTimeout:(callback:()=>void,ms:number)=>{if(ms===550 && duringSendWait){const work=duringSendWait;duringSendWait=null;void work().then(callback);return;}return setTimeout(callback,ms);}});
    const schedule=async(uid:string,now:Date)=>{await reminders.saveReminder(uid,{enabled:true,time:"09:00",timeZone:"Asia/Taipei",locale:"en"},now);await db.rewardReminder.update({where:{userId:uid},data:{nextSendAt:now}});};
    try {
      await t.test("Schedule overlap accepts one message; GET unsubscribe is inert; signed POST disables and invalidates old links",async()=>{
        const u=await user(),now=new Date(); await schedule(u.id,now);
        const before=calls;await Promise.all([reminders.runRewardReminders(now),reminders.runRewardReminders(now)]);assert.equal(calls-before,1);
        const delivery=await db.rewardDelivery.findFirstOrThrow({where:{userId:u.id}});assert.equal(delivery.status,"accepted");
        const reminder=await db.rewardReminder.findUniqueOrThrow({where:{userId:u.id}}),token=reminders.unsubscribeToken(u.id,reminder.tokenVersion);
        assert.equal(reminders.readUnsubscribeToken(token).userId,u.id);assert((await db.rewardReminder.findUniqueOrThrow({where:{userId:u.id}})).enabled);
        await assert.rejects(reminders.unsubscribeReminder(token.slice(0,-1)+"x"),/無效/);
        await reminders.unsubscribeReminder(token);await reminders.unsubscribeReminder(token);assert(!(await db.rewardReminder.findUniqueOrThrow({where:{userId:u.id}})).enabled);
        await reminders.saveReminder(u.id,{enabled:true,time:"09:00",timeZone:"Asia/Taipei",locale:"en"},now);await assert.rejects(reminders.unsubscribeReminder(token),/失效/);
      });
      await t.test("Effective action suppresses reminder; a visit alone does not; no opportunity means no email",async()=>{
        const now=new Date(),completed=await user(),visited=await user();await award(completed.id,"quiz","0");await service.claimVisit(visited.id);await schedule(completed.id,now);await schedule(visited.id,now);
        const before=calls;await reminders.runRewardReminders(now);assert.equal(calls-before,1);assert.equal((await db.rewardDelivery.findFirstOrThrow({where:{userId:completed.id}})).status,"skipped");
        const empty=await user();await schedule(empty.id,now);opportunities=[];const baseline=calls;await reminders.runRewardReminders(now);assert.equal(calls,baseline);assert.equal((await db.rewardDelivery.findFirstOrThrow({where:{userId:empty.id}})).status,"skipped");opportunities=[{kind:"profile",href:"/dashboard/profile",points:50}];
      });
      await t.test("Completing an action or unsubscribing during the send wait stops the provider request", async () => {
        const now = new Date(), completed = await user();
        await schedule(completed.id, now); duringSendWait = () => award(completed.id, "quiz", "0");
        const before = calls; await reminders.runRewardReminders(now);
        assert.equal(calls, before); assert.equal((await db.rewardDelivery.findFirstOrThrow({ where: { userId: completed.id } })).status, "skipped");
        const unsubscribed = await user(); await schedule(unsubscribed.id, now);
        const settings = await db.rewardReminder.findUniqueOrThrow({ where: { userId: unsubscribed.id } });
        duringSendWait = () => reminders.unsubscribeReminder(reminders.unsubscribeToken(unsubscribed.id, settings.tokenVersion));
        await reminders.runRewardReminders(now);
        assert.equal(calls, before); assert.equal((await db.rewardDelivery.findFirstOrThrow({ where: { userId: unsubscribed.id } })).status, "cancelled");
      });
      await t.test("An old queued quiz is skipped without rewriting its fixed payload or contacting the provider", async () => {
        const u = await user(), now = new Date(); await schedule(u.id, now);
        const reminder = await db.rewardReminder.findUniqueOrThrow({ where: { userId: u.id } });
        const payload = reminders.emailPayload(u.email, u.id, reminder.tokenVersion, "en", "quiz", "/dashboard/quiz", 50);
        const delivery = await db.rewardDelivery.create({ data: { userId: u.id, dayKey: policy.rewardKeys(now).day, scheduledAt: now, reminderVersion: reminder.tokenVersion, nextAttemptAt: now, payload } });
        const before = calls; await reminders.runRewardReminders(now);
        const saved = await db.rewardDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
        assert.equal(calls, before); assert.equal(saved.status, "skipped"); assert.deepEqual(saved.payload, JSON.parse(JSON.stringify(payload))); assert.equal(saved.attempts, 0);
      });
      await t.test("Send retries reuse the exact provider payload/key, stop after three attempts, redact credentials",async()=>{
        const u=await user(),now=new Date();await schedule(u.id,now);failSend=true;
        const offset=payloads.length;await reminders.runRewardReminders(now);await reminders.runRewardReminders(new Date(now.getTime()+16*60000));await reminders.runRewardReminders(new Date(now.getTime()+47*60000));
        failSend=false;const delivery=await db.rewardDelivery.findFirstOrThrow({where:{userId:u.id}});assert.equal(delivery.attempts,3);assert.equal(delivery.status,"failed");assert.doesNotMatch(delivery.lastError!,/re_qa_secret/);
        assert.equal(payloads.length-offset,3);assert.equal(new Set(payloads.slice(offset)).size,1);assert.equal(new Set(keys.slice(offset)).size,1);
        const old=await user();await schedule(old.id,new Date(now.getTime()-3*3600000));const before=calls;await reminders.runRewardReminders(now);assert.equal(calls,before);assert.equal((await db.rewardDelivery.findFirstOrThrow({where:{userId:old.id}})).status,"expired");
      });
    } finally { for(const key of ["REWARD_EMAIL_ENABLED","RESEND_API_KEY","RESEND_FROM_EMAIL","CRON_SECRET","AUTH_SECRET","NEXT_PUBLIC_APP_URL"]) { if(previousEnv[key]===undefined)delete process.env[key];else process.env[key]=previousEnv[key]; } }
  } finally { await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect(); }
});
