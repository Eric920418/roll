import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { addMonths, goalDeadline, today, dateSchema, roadmapDraftSchema, milestoneViews, type RoadmapDraft } from "../src/lib/roadmap/schema";
import { rankActions, type RankableAction } from "../src/lib/action-plan/ranking";
import { deriveDashboardPriority } from "../src/lib/action-plan/dashboard";
import type { ActionPlanDto } from "../src/lib/action-plan/service";
import type * as Service from "../src/lib/roadmap/service";
import type * as PlanService from "../src/lib/action-plan/service";
const require = createRequire(import.meta.url);
function load<T>(path: string, mocks: Record<string, unknown>) {
 const result = { exports: {} };
 runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: result, exports: result.exports, require: (id: string) => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), console: { error() {} }, process: { env: {} }, Date, Set, Map, JSON, Error });
 return result.exports as T;
}
const diagnosis = { companyStage: "MVP" as const, stageReason: "User reports MVP", stageConfidence: 70, bottleneckGroup: "Sales" as const, bottleneckCode: "no_leads", bottleneckReason: "User wants customers", bottleneckConfidence: 60 };
const draft: RoadmapDraft = { goal: "Find ten paying customers", startsAt: "2026-10-02", deadline: "2027-04-02", assumptions: ["Ten customers is a suggested target"], diagnosis, milestones: [1,2,3].map(n => ({ title: `Milestone ${n}`, expectedOutcome: `Observable result ${n}`, acceptanceCriteria: `Confirm result ${n} with evidence`, targetDate: `2027-0${n}-02` })), mode: "new", milestoneId: null, actions: [1,2,3,4,5].map(n => ({ clientKey: `task_${n}`, title: `Distinct task ${n}`, impact: "High", urgencyType: "urgent", urgencyDays: null, dependencyLevel: n===1?0:1, dependencyNotes: null, dependsOnKeys: n===1?[]:[`task_${n-1}`], difficulty: 2, actionTime: { minMinutes: 30, maxMinutes: 60 }, companyStage: "MVP", stageFit: { score:4,reason:"Supports current stage",confidence:60 }, bottleneckGroup: "Sales", bottleneckCode: "no_leads", bottleneckFit: { score:4,reason:"Builds actual qualified leads",confidence:60 }, outcomeCategory:"customers",expectedOutcome:`Distinct result ${n}`,outcomeTime:{min:1,max:3} })) };
const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v));
const stages = () => draft.milestones.map((m,i) => ({ ...m, id:`m${i}`, position:i, achievedAt:null as string|null, outcomeNote:null as string|null }));
const plan = (milestones: ReturnType<typeof milestoneViews>) => ({ id:"plan-a",revision:0, locale:"en",diagnosis,createdAt:"2026-10-02",actions:[],nextMoves:[],blockers:[],roadmap:{goal:draft.goal,startsAt:draft.startsAt,deadline:draft.deadline,assumptions:[],milestones} }) as ActionPlanDto;

test("Date resolution respects explicit dates, six-month defaults, leap/month end and Taiwan day",()=>{
 assert.equal(goalDeadline("Expand abroad",null,"2026-08-31"),"2027-02-28");
 assert.equal(addMonths("2023-08-31",6),"2024-02-29");
 assert.equal(goalDeadline("半年內拿到客戶",null,"2026-10-02"),"2027-04-02");
 assert.equal(goalDeadline("Find customers within three months",null,"2026-10-02"),"2027-01-02");
 assert.equal(goalDeadline("2027-03-01 拓展海外","2027-02-01","2026-10-02"),"2027-02-01");
 assert.equal(goalDeadline("兩週內完成",null,"2026-10-02"),"2026-10-16");
 assert.equal(today(new Date("2026-10-01T18:00:00Z")),"2026-10-02");
 assert.equal(dateSchema.safeParse("2026-02-30").success,false);
});
test("Draft validation rejects unordered/out-of-range dates, wrong task counts and invalid dependencies",()=>{
 assert(roadmapDraftSchema.safeParse(draft).success);
 for(const mutate of [(d:RoadmapDraft)=>{d.milestones[1].targetDate="2026-01-01";},(d:RoadmapDraft)=>{d.milestones[2].targetDate="2028-01-01";},(d:RoadmapDraft)=>{d.actions.pop();},(d:RoadmapDraft)=>{d.actions[0].dependencyLevel=1;d.actions[0].dependsOnKeys=["task_1"];},(d:RoadmapDraft)=>{d.actions[0].dependencyLevel=1;d.actions[0].dependsOnKeys=["missing"];},(d:RoadmapDraft)=>{d.actions[0].dependencyLevel=1;d.actions[0].dependsOnKeys=["task_2"];},(d:RoadmapDraft)=>{d.actions[0].impact="Critical";d.actions[1].impact="Critical";}]){const d=clone(draft);mutate(d);assert.equal(roadmapDraftSchema.safeParse(d).success,false);}
});
test("Completing tasks means awaiting outcome, not achieved; confirmation unlocks next stage",()=>{
 let m=stages();const tasks=[{milestoneId:"m0",done:true}];let view=milestoneViews(m,tasks);
 assert.equal(view[0].status,"awaiting");assert.equal(view[1].status,"blocked");
 const input={isPaying:true,onboardingDone:true,quizDone:true,plan:plan(view)};
 assert.equal(deriveDashboardPriority(input).kind,"outcome");
 m[0].achievedAt="2026-11-02";view=milestoneViews(m,tasks);assert.equal(view[1].status,"unplanned");assert.equal(deriveDashboardPriority({...input,plan:plan(view)}).kind,"next-stage");
 m=m.map(row=>({...row,achievedAt:"2027-04-02"}));assert.equal(deriveDashboardPriority({...input,plan:plan(milestoneViews(m,tasks))}).kind,"complete");
});
test("Milestone locks use the same rank/blocked decision as task dependencies",()=>{
 const row={id:"task-a",clientKey:"task_1",title:"Later task",milestoneId:"m1",done:false,impact:"High",urgencyType:"urgent",urgencyDays:null,dependencyLevel:0,dependencyNotes:null,difficulty:2,actionTimeMinHours:1,actionTimeMaxHours:1,actionTimeMinMinutes:30,actionTimeMaxMinutes:60,companyStage:"MVP",stageFit:4,stageFitReason:"Fits",stageFitConfidence:null,bottleneckGroup:"Sales",bottleneckCode:"no_leads",bottleneckFit:4,bottleneckFitReason:"Fits",bottleneckFitConfidence:null,outcomeCategory:"customers",expectedOutcome:"Find qualified leads",outcomeTimeMinDays:1,outcomeTimeMaxDays:3,source:"nova",stageFitEditedByUser:false,bottleneckFitEditedByUser:false,createdAt:new Date(),dependencies:[]} as RankableAction;
 const blocked=rankActions([row],new Map([["m1","Confirm phase one"]]))[0];assert.equal(blocked.rank,null);assert.equal(blocked.dependency.blocked,true);assert.equal(blocked.dependency.milestoneTitle,"Confirm phase one");assert.equal(rankActions([row])[0].rank,1);
});
class WriteError extends Error { constructor(message:string,public status=409){super(message);} }
function harness(){
 const state={userId:"a",input:null as unknown,draft:null as unknown,revision:0,basePlanId:null,basePlanRevision:null,pendingRequestId:null as string|null,pendingSince:null as Date|null,usageId:null as string|null,lastRequestId:null as string|null,lastError:null as string|null};
 let model:(()=>Promise<RoadmapDraft>)=async()=>clone(draft),quota=true,calls=0,reserves=0;const bill:boolean[]=[];
 const workspace={upsert:async()=>state,findUnique:async({where}:{where:{userId:string}})=>where.userId==="a"?state:null,findUniqueOrThrow:async()=>state,updateMany:async({where,data}:{where:Record<string,unknown>;data:Record<string,unknown>})=>{for(const[k,v]of Object.entries(where))if(state[k as keyof typeof state]!==v)return{count:0};for(const[k,v]of Object.entries(data))if(k==="revision")state.revision++;else (state as unknown as Record<string,unknown>)[k]=v;return{count:1};}};
 const mocks={"@/lib/prisma":{prisma:{roadmapWorkspace:workspace,actionPlan:{findMany:async()=>[]}}},"@/lib/action-plan/service":{PlanWriteError:WriteError,getActiveActionPlan:async()=>null},"@/lib/ai/allowance":{reserveAiUsage:async()=>{reserves++;return quota?"usage-1":null;},completeAiUsage:async(_id:string,success:boolean)=>{bill.push(success);}},"@/lib/rate-limit":{DAY_MS:86400000,checkRateLimit:async()=>({ok:true})},"./schema":require("../src/lib/roadmap/schema"),"./ai":{generateRoadmap:async()=>{calls++;return model();}}};
 const api=load<typeof Service>("src/lib/roadmap/service.ts",mocks);
 return{api,get state(){return state;},set model(fn:()=>Promise<RoadmapDraft>){model=fn;},set quota(v:boolean){quota=v;},get calls(){return calls;},get reserves(){return reserves;},bill};
}
const account={id:"a"} as Parameters<typeof Service.runRoadmap>[0];
const request={action:"generate" as const,goal:"Find customers",deadline:null,locale:"en" as const,revision:0,requestId:"request-1"};
test("Successful workspace replay does not generate or bill twice; accounts remain isolated",async()=>{
 const h=harness();await h.api.runRoadmap(account,request);await h.api.runRoadmap(account,request);assert.equal(h.calls,1);assert.equal(h.reserves,1);assert.deepEqual(h.bill,[true]);assert.equal((await h.api.getRoadmap("b")).draft,null);await assert.rejects(h.api.runRoadmap(account,{...request,requestId:"different"}),/another tab/);
});
test("Invalid AI/timeout preserves input and old draft; failure releases reservation",async()=>{
 const h=harness();h.state.draft=clone(draft);h.model=async()=>{throw new Error("Request timed out");};await assert.rejects(h.api.runRoadmap(account,request),(e:unknown)=>e instanceof WriteError&&e.status===504);assert.deepEqual(h.state.draft,draft);assert.equal((h.state.input as typeof request).goal,request.goal);assert.equal(h.state.pendingRequestId,null);assert.deepEqual(h.bill,[false]);
});
test("Quota exhaustion does not call the model, but retains user input",async()=>{
 const h=harness();h.quota=false;await assert.rejects(h.api.runRoadmap(account,request),(e:unknown)=>e instanceof WriteError&&e.status===429);assert.equal(h.calls,0);assert.equal(h.bill.length,0);assert.equal((h.state.input as typeof request).goal,request.goal);
});
test("Concurrent double submission is locked; late responses cannot replace newer revisions",async()=>{
 const h=harness();let resolve!:(d:RoadmapDraft)=>void;h.model=()=>new Promise(r=>{resolve=r;});const pending=h.api.runRoadmap(account,request);while(!resolve)await new Promise(r=>setTimeout(r,0));await assert.rejects(h.api.runRoadmap(account,request),/in progress/);h.state.revision++;h.state.draft={...clone(draft),goal:"Newer draft"};resolve(clone(draft));await assert.rejects(pending,/another tab/);assert.equal((h.state.draft as RoadmapDraft).goal,"Newer draft");assert.deepEqual(h.bill,[false]);
});
test("Outcome reversal refuses completed later stages, while safe reversal invalidates confirmation",async()=>{
 let updates=0;const m=stages().map(row=>({...row,achievedAt:row.position===0?new Date():null,actions:[{done:row.position===1}]}));
 const service=load<typeof PlanService>("src/lib/action-plan/service.ts",{"@/lib/prisma":{prisma:{}},"@/lib/roadmap/schema":require("../src/lib/roadmap/schema"),"./ranking":require("../src/lib/action-plan/ranking"),"./time":require("../src/lib/action-plan/time")});
 const tx={planMilestone:{findMany:async()=>m,update:async()=>{updates++;m[0].achievedAt=null;}}} as unknown as Parameters<typeof service.guardActionMilestone>[0];await assert.rejects(service.guardActionMilestone(tx,"plan-a","m0","undo"),/Undo later stage/);assert.equal(updates,0);m[1].actions[0].done=false;await service.guardActionMilestone(tx,"plan-a","m0","undo");assert.equal(updates,1);await assert.rejects(service.guardActionMilestone(tx,"plan-a","m1","done"),/Confirm previous/);
});
test("Roadmap route rejects anonymous and non-Pro callers before parsing input",async()=>{
 let session:object|null=null;const allowed=false;const api=load<{POST(req:object):Promise<{status:number}>;PATCH(req:object):Promise<{status:number}>}>("src/app/api/action-plans/roadmap/route.ts",{"@/lib/api":{unauthorized:()=>({status:401}),fail:(_m:string,status:number)=>({status})},"@/lib/auth/guard":{getUserSession:async()=>session},"@/lib/billing/gate":{requirePlan:async()=>allowed?account:null},"@/lib/roadmap/http":{roadmapFailure:()=>({status:500})},"@/lib/roadmap/service":{},"@/lib/roadmap/schema":require("../src/lib/roadmap/schema")});
 assert.equal((await api.POST({})).status,401);assert.equal((await api.PATCH({})).status,401);session={uid:"a"};assert.equal((await api.POST({})).status,403);assert.equal((await api.PATCH({})).status,403);
});
test("Invalid AI milestone output gets one repair and never reaches task generation",async()=>{
 let calls=0,taskCalls=0;
 class Client { messages={create:async()=>{calls++;return{content:[{type:"tool_use",input:{milestones:[]}}]};}}; }
 const ai=load<{generateRoadmap(input:object):Promise<unknown>}>("src/lib/roadmap/ai.ts",{"@anthropic-ai/sdk":{default:Client},"@/lib/action-plan/ai":{generateActionCandidates:async()=>{taskCalls++;return[];}},"@/lib/action-plan/constants":require("../src/lib/action-plan/constants"),"@/lib/action-plan/schemas":require("../src/lib/action-plan/schemas"),"./schema":require("../src/lib/roadmap/schema")});
 await assert.rejects(ai.generateRoadmap({goal:"Expand abroad",startsAt:"2026-10-02",deadline:"2027-04-02",locale:"en",account:{profile:{}},current:null}),/Invalid AI roadmap/);assert.equal(calls,2);assert.equal(taskCalls,0);
});
