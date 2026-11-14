import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { STEPS, flowActions, flowDataSchema, emptyRecord, emptyContact, type FlowData, type StepId } from "../src/lib/action-plan/flow/catalog";
import { evaluateStep, validConversation, type FlowContext } from "../src/lib/action-plan/flow/evaluate";
import { salesMutationSchema, salesRecordSchema, validProofs } from "../src/lib/validation/schema";
const diagnosis = { companyStage: "MVP" as const, stageReason: "Saved evidence", stageConfidence: 70, bottleneckGroup: "Sales" as const, bottleneckCode: "no_leads", bottleneckReason: "Find customers", bottleneckConfidence: 60 };

test("Workflow catalog has exactly five milestones, sixteen ordered steps and four templates", () => {
  assert.equal(STEPS.length, 16);
  assert.deepEqual([...new Set(STEPS.map(s => s.kind))].sort(), ["conversation", "document", "organize", "outreach"]);
  const actions = flowActions(diagnosis, "zh-tw");
  assert.deepEqual([0, 1, 2, 3, 4].map(i => STEPS.filter(s => s.milestone === i).length), [4, 3, 3, 3, 3]);
  actions.forEach((a, i) => assert.deepEqual(a.dependsOnKeys, i ? [actions[i - 1].clientKey] : []));
  assert.equal(flowDataSchema.safeParse({ kind: "organize", values: {}, confirmed: [], criteria: [], tiers: [], selections: [], confirmations: 5 }).success, false);
});
test("New completion rejects bare counts, duplicate people, future dates and owner-forged review", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...emptyRecord("r" + i), company: "Company " + i, name: "Person " + i, fit: "yes" as const, relationship: "Customer", date: "2026-08-03", pain: "Slow reporting", severity: "high" as const, solution: "Spreadsheets", wtp: "willing" as const }));
  const context: FlowContext = { actions: [], proofs: [], locale: "en", now: new Date("2026-09-07") };
  assert(evaluateStep(context, "01-1", { kind: "conversation", market: "TW", records: rows }).ready);
  assert(validConversation(rows[0], "2026-09-07"));
  assert(!validConversation({ ...rows[0], fit: undefined }, "2026-09-07"));
  assert(!validConversation({ ...rows[0], fit: "uncertain" }, "2026-09-07"));
  assert(!evaluateStep(context, "01-1", { kind: "conversation", market: "TW", records: [...rows.slice(0, 9), rows[0]] }).ready);
  assert(!evaluateStep(context, "01-1", { kind: "conversation", market: "TW", records: rows.map(r => ({ ...r, date: "2027-01-01" })) }).ready);
  assert(!evaluateStep(context, "04-1", { kind: "outreach", market: "TW", contacts: [] }).ready);
  const proof = { id: randomUUID(), kind: "paid", amount: "100", currency: "USD", date: "2026-08-03", pathname: "qa.pdf", filename: "qa.pdf", confirmed: true, review: { status: "approved" } };
  assert.equal(salesMutationSchema.shape.proof.safeParse(proof).success, false);
  const record = salesRecordSchema.parse({ scope: { planId: "p" }, company: "Acme", name: "Buyer", version: 1, status: "paid", events: [], proofs: [proof] });
  assert.equal(validProofs(record).length, 1);
  record.proofs[0].review!.status = "pending"; assert.equal(validProofs(record).length, 0);
  delete record.proofs[0].review; assert.equal(validProofs(record).length, 1, "Legacy proof semantics remain unchanged");
});

test("Sixteen-step PostgreSQL workflow: ownership, server gates, external replies, review, carry-over, history and atomic completion", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  const owner = await db.user.create({ data: { email: randomUUID() + "@flow.invalid", plan: "business" } });
  const other = await db.user.create({ data: { email: randomUUID() + "@flow.invalid", plan: "business" } });
  let now = Date.parse("2026-08-03T04:00:00Z"), failReward = false;
  class Clock extends Date { constructor(value?: string | number | Date) { super(value === undefined ? now : value instanceof Date ? value.getTime() : value); } static now() { return now; } }
  const cache = new Map<string, { exports: unknown }>(), require = createRequire(import.meta.url);
  const mocks: Record<string, unknown> = { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/getting-started/service": { completeGettingStarted: async () => {} },
    "@/lib/auth/account": { getCurrentAccount: async () => null }, "@/lib/billing/gate": { getEffectivePlan: () => "business" },
    "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date(now + 86400000) },
    "@/lib/rate-limit": { DAY_MS: 86400000, checkRateLimit: async () => ({ ok: true }) },
    "@/lib/security/log": { logSecurityError() {} },
    "@/lib/validation/proof": { verifyProof: async () => {} },
  };
  function load<T>(file: string): T {
    const full = resolve(file), found = cache.get(full); if (found) return found.exports as T;
    const result = { exports: {} }; cache.set(full, result);
    runInNewContext(ts.transpileModule(readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
      module: result, exports: result.exports, Date: Clock, process: { env: { MEMBER_NETWORK_ENABLED: "false" } }, console, URL, Response, Headers, Buffer, setTimeout, clearTimeout,
      require: (id: string) => { if (id in mocks) return mocks[id]; if (id.startsWith("@/") || id.startsWith(".")) { const base = id.startsWith("@/") ? resolve("src", id.slice(2)) : resolve(dirname(full), id); const target = [base, base + ".ts", base + "/index.ts"].find(p => existsSync(p) && p.endsWith(".ts")); if (target) return load(target); } return require(id); },
    });
    return result.exports as T;
  }
  const plans = load<typeof import("../src/lib/action-plan/service")>("src/lib/action-plan/service.ts");
  const rewards = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts");
  mocks["@/lib/rewards/service"] = { ...rewards, awardReward: async (...args: Parameters<typeof rewards.awardReward>) => { const result = await rewards.awardReward(...args); if (failReward) throw new Error("Injected reward failure"); return result; } };
  const flow = load<typeof import("../src/lib/action-plan/flow/service")>("src/lib/action-plan/flow/service.ts");
  const review = load<typeof import("../src/lib/action-plan/flow/review")>("src/lib/action-plan/flow/review.ts");
  const sales = load<typeof import("../src/lib/validation/service")>("src/lib/validation/service.ts");
  let current: Awaited<ReturnType<typeof flow.getFlow>>;
  const old = await db.actionPlan.create({ data: { userId: owner.id, activeKey: owner.id, locale: "en", requestId: randomUUID(), ...diagnosis } });
  const oldAction = await db.actionItem.create({ data: { actionPlanId: old.id, clientKey: "legacy", title: "Existing completed action", impact: "High", urgencyType: "scheduled", difficulty: 2, actionTimeMinHours: 1, actionTimeMaxHours: 2, companyStage: "MVP", stageFit: 5, stageFitReason: "Saved", bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckFit: 5, bottleneckFitReason: "Saved", outcomeCategory: "customers", expectedOutcome: "Existing outcome", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7, done: true, completedAt: new Date(now - 86400000), taskWorkspace: { oldRecord: "Must remain identical" } } });
  const original = JSON.stringify(await db.actionItem.findUnique({ where: { id: oldAction.id } }));
  async function refresh() { current = await flow.getFlow(owner.id); return current; }
  async function save(step: StepId, data: FlowData) { await refresh(); current = await flow.mutateFlow(owner.id, { action: "save", planId: current.plan.id, revision: current.plan.revision!, step, data }); }
  async function complete(step: StepId) { current = await flow.mutateFlow(owner.id, { action: "complete", planId: current.plan.id, revision: current.plan.revision!, step, requestId: randomUUID() }); }
  async function paid(company: string, date = "2026-08-03") {
    const existing = await db.deal.findMany({ where: { userId: owner.id }, select: { id: true, validation: true } });
    const record = existing.flatMap(d => { const r = salesRecordSchema.safeParse(d.validation).data; return r?.company === company ? [r] : []; })[0];
    const input = salesMutationSchema.parse({ scope: { planId: current.plan.id }, requestId: randomUUID(), version: record?.version || 0, company, name: "Buyer", status: "paid", quote: "Paid for a pilot", reason: "Payment received", amount: "100", currency: "USD", proof: { id: randomUUID(), kind: "paid", amount: "100", currency: "USD", date, pathname: "commercial-evidence/" + owner.id + "/" + randomUUID() + ".pdf", filename: "receipt.pdf", confirmed: true } });
    const dealId = await sales.saveSalesRecord(owner.id, input);
    const pending = (await review.evidenceQueue()).find(r => r.dealId === dealId && r.proofId === input.proof!.id)!;
    assert.equal(pending.status, "pending"); return pending;
  }
  try {
    await t.test("New plan is complete and archives the old plan without changing any old action field", async () => {
      const result = await plans.persistGeneratedPlan({ userId: owner.id, locale: "en", requestId: randomUUID(), workflowVersion: 2, diagnosis, actions: flowActions(diagnosis, "en"), answers: [{ question: "Goal", answer: "Build steady customers" }], basePlan: { id: old.id, revision: 0 } });
      assert.equal(result.workflowVersion, 2); assert.equal(result.actions.length, 16); assert.equal(result.roadmap?.milestones.length, 5);
      assert.equal(JSON.stringify(await db.actionItem.findUnique({ where: { id: oldAction.id } })), original);
      assert((await db.actionPlan.findUniqueOrThrow({ where: { id: old.id } })).archivedAt);
      await refresh(); assert.equal(current.current, "01-1");
      assert.equal((await plans.getActiveActionPlan(owner.id))!.nextMoves[0].metric!.target, 10);
      await assert.rejects(flow.getFlow(other.id, current.plan.id), /not found/);
      await assert.rejects(flow.mutateFlow(other.id, { action: "complete", planId: current.plan.id, revision: 0, step: "01-1", requestId: randomUUID() }), /not found/);
    });
    await t.test("Supplement rounds cannot overflow the existing participant capacity", async () => {
      const plan=await plans.persistGeneratedPlan({userId:other.id,locale:"en",requestId:randomUUID(),workflowVersion:2,diagnosis,actions:flowActions(diagnosis,"en"),answers:[],basePlan:null});
      const rows=Array.from({length:250},(_,i)=>({...emptyRecord("capacity-"+i),company:"Company "+i,name:"Person "+i,fit:"yes" as const,date:"2026-08-03",relationship:"prospect",pain:"Slow reporting",severity:"high" as const,solution:"Spreadsheets",wtp:"willing" as const}));
      await db.actionItem.updateMany({where:{actionPlanId:plan.id,clientKey:{in:["nova_v2_01-1","nova_v2_01-2","nova_v2_01-3"]}},data:{done:true,completedAt:new Date(now)}});
      await db.actionItem.update({where:{id:plan.actions.find(a=>a.clientKey==="nova_v2_01-1")!.id},data:{taskWorkspace:{version:2,step:"01-1",data:{kind:"conversation",market:"TW",records:rows}}}});
      await db.actionItem.update({where:{id:plan.actions.find(a=>a.clientKey==="nova_v2_01-4")!.id},data:{taskWorkspace:{version:2,step:"01-4",data:{kind:"organize",values:{},confirmed:[],criteria:[],selections:[],tiers:rows.map(r=>({leadId:r.id,matches:[],override:"C",reason:"Needs more evidence",confirmed:true}))}}}});
      const view=await flow.getFlow(other.id),before=JSON.stringify(view.plan);
      await assert.rejects(flow.mutateFlow(other.id,{action:"supplement",planId:plan.id,revision:view.plan.revision!,requestId:randomUUID()}),/250 participants/);
      assert.equal(JSON.stringify((await flow.getFlow(other.id)).plan),before);
    });
    await t.test("Plan search usage separates holds, net captures, refunds and unattributed history", async () => {
      const frozen=JSON.stringify(await db.actionPlan.findUnique({where:{id:current.plan.id}}));
      for(const [userId,planId,status] of [[owner.id,current.plan.id,"reserved"],[owner.id,current.plan.id,"captured"],[owner.id,current.plan.id,"refunded"],[owner.id,old.id,"captured"],[owner.id,"","captured"],[other.id,current.plan.id,"captured"]]) {
        const row=await db.tokenReservation.create({data:{userId,requestId:randomUUID(),payloadHash:"qa-usage",kind:"search",resourceId:randomUUID(),amount:20,status,expiresAt:new Date(now+86400000),metadata:planId?{planId}:{}}});
        const entries=[["reserve",-20,20],...(status!=="reserved"?[["capture",0,-20]]:[]),...(status==="refunded"?[["refund",20,0]]:[])];
        await db.tokenLedger.createMany({data:entries.map(([kind,availableDelta,reservedDelta])=>({userId,reservationId:row.id,eventKey:randomUUID(),kind:String(kind),availableDelta:Number(availableDelta),reservedDelta:Number(reservedDelta),reason:"Isolated usage fixture"}))});
      }
      await refresh();assert.deepEqual(JSON.parse(JSON.stringify(current.searchTokens)),{recordedOrders:3,spent:20,reserved:20});
      assert.equal(JSON.stringify(await db.actionPlan.findUnique({where:{id:current.plan.id}})),frozen);
    });
    await t.test("Empty completion, jumping and stale versions fail; failed writes retain records", async () => {
      await assert.rejects(complete("01-1"), /Save this step/);
      await assert.rejects(flow.mutateFlow(owner.id, { action: "complete", planId: current.plan.id, revision: current.plan.revision!, step: "02-1", requestId: randomUUID() }), /current step/);
      const rows = Array.from({ length: 10 }, (_, i) => ({ ...emptyRecord("r" + i), company: "Customer " + i, name: "Person " + i, fit: "yes" as const, relationship: "Potential customer", date: "2026-08-03", pain: "Manual reporting", severity: "high" as const, solution: "Spreadsheets", wtp: "willing" as const }));
      const revision = current.plan.revision!;
      await save("01-1", { kind: "conversation", market: "TW", records: rows });
      await assert.rejects(flow.mutateFlow(owner.id, { action: "save", planId: current.plan.id, revision, step: "01-1", data: { kind: "conversation", market: "", records: [] } }), /changed/);
      failReward = true; await assert.rejects(complete("01-1"), /Injected reward/); failReward = false;
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: current.steps[0].actionId } })).done, false);
      await refresh(); await complete("01-1"); assert.equal(current.current, "01-2");
    });
    await t.test("Five real bearer-link responses are required; duplicate replies count once and old statements invalidate links", async () => {
      const data: FlowData = { kind: "organize", values: { positioning: "We help founders replace manual reporting with reliable evidence." }, confirmed: ["positioning"], criteria: [], tiers: [], selections: [] };
      await save("01-2", data); await assert.rejects(complete("01-2"), /five interviewee/);
      await refresh();
      const earlier = await flow.mutateFlow(owner.id, { action: "confirmLink", planId: current.plan.id, revision: current.plan.revision!, leadId: "r0" });
      const oldLink = new URL(earlier.link!, "http://localhost"), oldToken = oldLink.searchParams.get("token")!, oldId = oldLink.pathname.split("/").at(-1)!;
      await flow.confirmation(oldId, oldToken, "yes");
      await save("01-2", { ...data, values: { positioning: "A changed statement for a new confirmation round." } });
      await assert.rejects(flow.confirmation(oldId, oldToken), /expired/);
      await save("01-2", data);
      await assert.rejects(flow.confirmation(oldId, oldToken), /expired/);

      for (let i = 0; i < 5; i++) {
        await refresh(); const result = await flow.mutateFlow(owner.id, { action: "confirmLink", planId: current.plan.id, revision: current.plan.revision!, leadId: "r" + i });
        const url = new URL(result.link!, "http://localhost"), token = url.searchParams.get("token")!, id = url.pathname.split("/").at(-1)!;
        await flow.confirmation(id, token, "yes"); await flow.confirmation(id, token, "yes");
        await assert.rejects(flow.confirmation(id, token, "no"), /already saved/);
      }
      await refresh(); assert.equal(current.steps[1].current, 5);
      assert.equal(current.positioningReplies.filter(r => r.answer === "yes").length, 5);
      assert.equal(current.positioningReplies.length, 10);
      assert(current.positioningReplies.every(r => Object.keys(r).sort().join(",") === "answer,at,leadId"));
      assert.equal((await plans.getActiveActionPlan(owner.id))!.nextMoves[0].metric!.current, 5);
      await complete("01-2");
    });
    await t.test("Confirmed criteria and tiers carry the exact A lead IDs into proposals", async () => {
      const criteria = Array.from({ length: 4 }, (_, i) => ({ id: "c" + i, label: "Qualification condition " + i, weight: 25, sources: Array.from({ length: 10 }, (_, n) => "r" + n), confirmed: true }));
      await save("01-3", { kind: "organize", values: {}, confirmed: [], criteria, tiers: [], selections: [] }); await complete("01-3");
      const frozen = JSON.stringify(await db.actionItem.findMany({where:{actionPlanId:current.plan.id,clientKey:{in:["nova_v2_01-1","nova_v2_01-2","nova_v2_01-3"]}},orderBy:{id:"asc"}}));
      const base: Extract<FlowData,{kind:"organize"}> = {kind:"organize",values:{},confirmed:[],criteria:[],tiers:Array.from({length:10},(_,i)=>({leadId:"r"+i,matches:[],override:"C",reason:"Not the right fit",confirmed:true})),selections:[]};
      await save("01-4",base); await assert.rejects(complete("01-4"),/three A/);
      const round = {action:"supplement" as const,planId:current.plan.id,revision:current.plan.revision!,requestId:randomUUID()};
      await assert.rejects(flow.mutateFlow(other.id,round),/not found/);
      current=await flow.mutateFlow(owner.id,round); current=await flow.mutateFlow(owner.id,round);
      let tierData=current.steps.find(s=>s.id==="01-4")!.data as Extract<FlowData,{kind:"organize"}>;
      assert.equal(tierData.supplements!.length,1); await assert.rejects(complete("01-4"),/supplemental/);
      const originalRows=(current.steps[0].data as Extract<FlowData,{kind:"conversation"}>).records;
      await assert.rejects(save("01-4",{...tierData,supplements:[{id:round.requestId,records:[originalRows[0]]}]}),/distinct/);
      await refresh();
      const extra=Array.from({length:3},(_,i)=>({...originalRows[0],id:"s"+i,company:"Supplement "+i,name:"Additional person "+i}));
      await save("01-4",{...tierData,supplements:[{id:round.requestId,records:extra.slice(0,2)}]});assert.equal(current.leads.length,10);
      tierData=current.steps.find(s=>s.id==="01-4")!.data as typeof tierData;
      await save("01-4",{...tierData,supplements:[{id:round.requestId,records:extra}]});assert.equal(current.leads.length,13);
      tierData=current.steps.find(s=>s.id==="01-4")!.data as typeof tierData;
      await assert.rejects(save("01-4",{...tierData,supplements:[]}),/rounds changed/);
      await assert.rejects(save("01-4",{...tierData,supplements:[{id:round.requestId,records:extra.map(r=>({...r,pain:"Changed"}))}]}),/retained/);
      await refresh(); await save("01-4",{...tierData,tiers:current.leads.map(r=>({leadId:r.id,matches:criteria.map(c=>c.id),override:"",reason:"",confirmed:true}))});
      assert.equal(JSON.stringify(await db.actionItem.findMany({where:{actionPlanId:current.plan.id,clientKey:{in:["nova_v2_01-1","nova_v2_01-2","nova_v2_01-3"]}},orderBy:{id:"asc"}})),frozen);
      await complete("01-4");
      assert.equal(current.plan.roadmap!.milestones[0].status, "achieved");
      const proposals = current.steps.find(s => s.id === "02-1")!.data; assert.equal(proposals.kind, "outreach");
      if (proposals.kind !== "outreach") throw Error("Wrong proposal template");
      assert.equal(proposals.contacts[0].leadId, "r0");
      await save("02-1", { ...proposals, contacts: proposals.contacts.slice(0, 3).map(c => ({ ...c, date: "2026-08-03", channel: "Email", status: "sent", offer: "USD100 paid pilot, reporting setup, fourteen days" })) }); await complete("02-1");
    });
    await t.test("Follow-up is append-only after proposal completion, retries once and rejects other owners", async () => {
      const source=await db.actionItem.findUniqueOrThrow({where:{id:current.steps.find(s=>s.id==="02-1")!.actionId}}), before=JSON.stringify([source.taskWorkspace,source.done,source.completedAt]);
      const contact=current.followups[0], update={id:randomUUID(),contactId:contact.contactId,date:"2026-08-03",status:"replied" as const,note:"Customer requested a receipt"};
      const input={action:"followup" as const,planId:current.plan.id,revision:current.plan.revision!,sourceActionId:source.id,update};
      await assert.rejects(flow.mutateFlow(other.id,input),/not found/);
      current=await flow.mutateFlow(owner.id,input);current=await flow.mutateFlow(owner.id,input);
      const after=await db.actionItem.findUniqueOrThrow({where:{id:source.id}});
      assert.equal(JSON.stringify([after.taskWorkspace,after.done,after.completedAt]),before);
      assert.equal((after.taskFinding as {followups:unknown[]}).followups.length,1);
      assert.equal(current.followups[0].status,"replied");
      const reminders=load<typeof import("../src/lib/evidence/reminders")>("src/lib/evidence/reminders.ts");
      const evidenceState=load<typeof import("../src/lib/evidence/schema")>("src/lib/evidence/schema.ts").evidenceStateSchema.parse({preferences:{task:true,weekly:false,timeZone:"Asia/Taipei",locale:"en"}});
      await db.evidenceWorkspace.upsert({where:{userId:owner.id},create:{userId:owner.id,data:evidenceState as unknown as Prisma.InputJsonValue},update:{data:evidenceState as unknown as Prisma.InputJsonValue}});
      now=Date.parse("2026-08-11T04:00:00Z");
      await reminders.runEvidenceReminders(new Date(now));await reminders.runEvidenceReminders(new Date(now));
      const alerts=await db.memberNotification.findMany({where:{userId:owner.id,eventKey:{startsWith:"evidence-followup:"}}});
      assert.equal(alerts.length,2,"Only the two unanswered contacts from the completed proposal step receive one reminder each");
      assert(await reminders.followupReminderValid(owner.id, alerts[0].payload as Record<string,unknown>));
      assert(!await reminders.followupReminderValid(other.id, alerts[0].payload as Record<string,unknown>));
      assert(!await reminders.followupReminderValid(owner.id,{planId:current.plan.id,sourceActionId:source.id,contactId:contact.contactId,contactDate:"2026-08-03"}));
      now=Date.parse("2026-08-03T04:00:00Z");
      await assert.rejects(flow.mutateFlow(owner.id,{...input,update:{...update,note:"Different request"}}),/changed/);
    });
    await t.test("Pending, self-reviewed and stale proof cannot unlock a step; approved evidence can", async () => {
      const proof = await paid("Customer 0");
      await refresh(); await assert.rejects(complete("02-2"), /approved payment/);
      await assert.rejects(review.reviewEvidence(owner.email, { ...proof, status: "approved", note: "Self approval must fail" }), /own proof/);
      await assert.rejects(review.reviewEvidence("reviewer@qa.invalid", { ...proof, version: proof.version + 1, status: "approved", note: "Stale review must fail" }), /changed/);
      await review.reviewEvidence("reviewer@qa.invalid", { ...proof, status: "approved", note: "Matched company, amount and actual receipt" }); await refresh();
      assert.equal((await plans.getActiveActionPlan(owner.id))!.nextMoves[0].metric!.current, 1);
      await complete("02-2");
      await save("02-3", { kind: "organize", values: { price: "USD100", scope: "Reporting pilot for fourteen days", terms: "Payment before delivery; agreed success criteria" }, confirmed: ["price", "scope", "terms"], criteria: [], tiers: [], selections: [] }); await complete("02-3");
    });
    await t.test("Outreach needs four consecutive qualifying weeks and twelve conversations; channel rates are derived", async () => {
      now = Date.parse("2026-09-07T04:00:00Z");
      const contacts = Array.from({ length: 80 }, (_, i) => ({ ...emptyContact("o" + i), company: "Outreach " + i, name: "Buyer " + i, date: "2026-08-" + String(3 + Math.floor(i / 20) * 7).padStart(2, "0"), channel: i % 2 ? "Email" : "LinkedIn", status: i % 20 < 3 ? "conversation" as const : "sent" as const, offer: "Reporting pilot for USD100", matches: ["c0", "c1", "c2", "c3"], pain: "Manual reports", solution: "Spreadsheets", wtp: "willing" as const }));
      await save("03-1", { kind: "outreach", market: "TW", contacts: contacts.slice(0, 79) }); await assert.rejects(complete("03-1"), /Four consecutive weeks/);
      await save("03-1", { kind: "outreach", market: "TW", contacts }); await complete("03-1");
      assert.equal(current.channels.length, 2); assert.equal(current.channels.reduce((sum, c) => sum + c.conversation, 0), 12);
      await save("03-2", { kind: "organize", values: {}, confirmed: ["channels"], criteria: [], tiers: [], selections: ["Email", "LinkedIn"] }); await complete("03-2");
      await save("03-3", { kind: "document", sections: Array.from({ length: 4 }, (_, i) => ({ id: String(i), body: "Saved playbook chapter " + i + " with practical execution instructions.", confirmed: true })) }); await complete("03-3");
    });
    await t.test("Five approved paying companies, paid-customer reviews, financial metrics and weekly tasks", async () => {
      for (const company of ["Outreach 0", "Paid Company 2", "Paid Company 3", "Paid Company 4"]) {
        const proof = await paid(company, "2026-09-05"); await review.reviewEvidence("reviewer@qa.invalid", { ...proof, status: "approved", note: "Receipt matches company and payment" });
      }
      await refresh(); await save("04-1", current.steps.find(s => s.id === "04-1")!.data); await complete("04-1");
      const reviews = current.steps.find(s => s.id === "04-2")!.data;
      if (reviews.kind !== "conversation") throw Error("Wrong review template");
      await save("04-2", { ...reviews, records: reviews.records.map(r => ({ ...r, date: "2026-09-07", reason: "Reliable customer evidence", missing: "None requested", referral: "Other founders" })) }); await complete("04-2");
      const renewal = await paid("Customer 0", "2026-09-06"); await review.reviewEvidence("reviewer@qa.invalid", { ...renewal, status: "approved", note: "A second dated payment for renewal" }); await refresh();
      await save("04-3", { kind: "organize", values: { currency: "USD", spend: "1000" }, confirmed: ["renewal", "revenue", "cost"], criteria: [], tiers: [], selections: ["customer 0"] });
      assert.equal(current.metrics.renewalRate, 1); assert.equal(current.metrics.averageRevenue, 120); assert.equal(current.metrics.acquisitionCost, 200);
      await complete("04-3");
      await save("05-1", { kind: "organize", values: { target: "12000", conversion: "" }, confirmed: ["target", "activity"], criteria: [], tiers: [], selections: [] }); await complete("05-1");
      assert.equal(await db.weekCalendarItem.count({ where: { userId: owner.id } }), 13);
      await complete("05-1"); assert.equal(await db.weekCalendarItem.count({ where: { userId: owner.id } }), 13);
    });
    await t.test("Second market needs actual conversations and reviewed payment; report sharing is explicit and revocable", async () => {
      const contacts = Array.from({ length: 10 }, (_, i) => ({ ...emptyContact("j" + i), company: "Japan " + i, name: "Buyer " + i, date: "2026-09-07", channel: "Partner", status: "conversation" as const, offer: "USD100 reporting pilot", pain: "Manual reports", solution: "Spreadsheets", wtp: "willing" as const }));
      await save("05-2", { kind: "outreach", market: "TW", contacts }); await assert.rejects(complete("05-2"), /different/);
      const proof = await paid("Japan 0", "2026-09-07"); await review.reviewEvidence("reviewer@qa.invalid", { ...proof, status: "approved", note: "New-market company payment verified" }); await refresh();
      await save("05-2", { kind: "outreach", market: "JP", contacts }); await complete("05-2");
      assert.equal(current.metrics.averageRevenue, 120, "New market payments do not rewrite the confirmed financial snapshot");
      const reportDraft = current.steps.find(s => s.id === "05-3")!.data;
      assert.equal(reportDraft.kind, "document");
      if (reportDraft.kind === "document") assert(reportDraft.sections[3].body.includes(String(current.weekly.weeklyContacts)), "The report carries the confirmed weekly target");
      await save("05-3", { kind: "document", sections: Array.from({ length: 4 }, (_, i) => ({ id: String(i), body: "Reviewed validation report chapter " + i + " with expansion evidence and next targets.", confirmed: true })) }); await complete("05-3");
      assert(current.steps.every(s => s.done)); assert(current.plan.roadmap!.milestones.every(m => m.status === "achieved"));
      const actionId = current.steps.at(-1)!.actionId;
      await assert.rejects(flow.reportAccess(actionId, other.id), /disabled/);
      const shared = await flow.mutateFlow(owner.id, { action: "share", planId: current.plan.id, revision: current.plan.revision!, enabled: true });
      const token = new URL(shared.link!, "http://localhost").searchParams.get("token")!;
      assert.equal((await flow.reportAccess(actionId, undefined, token)).sections.length, 4);
      await refresh(); await flow.mutateFlow(owner.id, { action: "share", planId: current.plan.id, revision: current.plan.revision!, enabled: false });
      await assert.rejects(flow.reportAccess(actionId, undefined, token), /disabled/);
      assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action", eventKey: { startsWith: "action:" } } }), 17, "16 new completions plus the preserved legacy claim");
    });
    await t.test("Revocation blocks new sharing, retaining all completion history and source snapshots", async () => {
      const deal = (await db.deal.findMany({ where: { userId: owner.id } })).find(d => salesRecordSchema.parse(d.validation).company === "Customer 0")!;
      for (const id of salesRecordSchema.parse(deal.validation).proofs.map(p => p.id)) {
        const record = salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).validation);
        await sales.saveSalesRecord(owner.id, salesMutationSchema.parse({ scope: record.scope, requestId: randomUUID(), version: record.version, company: record.company, name: record.name, status: "considering", quote: "Refunded", reason: "Payment voided", amount: "", currency: "", revoke: { id, reason: "Refunded to customer" } }));
      }
      await refresh(); assert(current.integrity.some(s => s.step === "02-2")); assert(current.steps.every(s => s.done));
      assert.equal((await plans.getActiveActionPlan(owner.id))!.workflowNeedsReview, true);
      await assert.rejects(flow.mutateFlow(owner.id, { action: "share", planId: current.plan.id, revision: current.plan.revision!, enabled: true }), /valid evidence/);
      const action = await db.actionItem.findUniqueOrThrow({ where: { id: current.steps[14].actionId } });
      assert((action.taskFinding as Prisma.JsonObject).outcome);
      assert.equal(JSON.stringify(await db.actionItem.findUnique({ where: { id: oldAction.id } })), original);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] }, email: { in: [owner.email, other.email] } } }); await db.$disconnect();
  }
});
