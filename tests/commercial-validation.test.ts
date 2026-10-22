import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { taipeiWeek } from "../src/lib/check-ins/schema";
import { emptyInsight, insightSchema } from "../src/lib/customer-insights/schema";
import { commitmentSummary, proofSchema, salesMutationSchema, salesRecordSchema, commercialTask, commercialTarget, priorityCompanies, standardScripts, type SalesRecord, type SalesMutation } from "../src/lib/validation/schema";

const proof = (kind: "signed" | "paid" = "signed") => ({ id: randomUUID(), kind, amount: "125.50", currency: "USD", date: "2026-10-21", pathname: `commercial-evidence/owner/${randomUUID()}.pdf`, filename: "proof.pdf", confirmed: true as const });
const record = (company = "Acme", proofs: SalesRecord["proofs"] = [proof()]): SalesRecord => ({ scope: { journeyId: "journey" }, company, name: "Founder", version: 1, status: "signed", events: [], proofs });
test("Commercial fields are optional; interest is never a proof and four legacy answers remain valid", () => {
  const base = { ...emptyInsight("discover"), name: "Founder", company: "Acme", notes: "Manual reporting" };
  assert(insightSchema.safeParse(base).success);
  assert(insightSchema.safeParse({ ...base, commercial: { amount: "", currency: "", willingness: "considering" } }).success);
  for (const amount of ["0", "0.00", "-1", "NaN", "1.001"]) assert.equal(proofSchema.safeParse({ ...proof(), amount }).success, false);
  assert.equal(proofSchema.safeParse({ ...proof(), confirmed: false }).success, false);
  assert.equal(proofSchema.safeParse({ ...proof(), pathname: "" }).success, false);
  assert.equal(proofSchema.safeParse({ ...proof(), date: "2026-02-30" }).success, false);
  assert.equal(proofSchema.safeParse({ ...proof(), kind: "verbal_yes" }).success, false);
});
test("Commitments dedupe normalized companies, separate paid / signed and currencies, and stop counting revoked proofs", () => {
  const signed = proof(), paid = proof("paid"), twd = { ...proof("paid"), currency: "TWD", amount: "500" };
  const summary = commitmentSummary([record(" ＡＣＭＥ ", [signed]), record("acme", [paid]), record("Beta", [twd])]);
  assert.equal(summary.total, 2); assert.equal(summary.signed, 1); assert.equal(summary.paid, 2);
  assert.deepEqual(summary.amounts, { USD: { signed: 12550, paid: 12550 }, TWD: { signed: 0, paid: 50000 } });
  assert.equal(commitmentSummary([record("Acme", [{ ...signed, revokedAt: new Date().toISOString(), revokeReason: "Voided" }])]).total, 0);
  assert.equal(commitmentSummary([]).total, 0);
  assert.equal(commercialTarget({ title: "Run paid pilot offer with 3 prospects", expectedOutcome: "At least 1 of 3 agrees" }), 1);
  assert.equal(commercialTarget({ title: "Close 3 paying customers" }), 3);
  assert.equal(commercialTarget({ title: "Paid pilot", metricTarget: 4 }), 4);
  assert(commercialTask({ title: "Renamed task", commercialValidation: { requiresConfirmation: true } }));
});
test("Priority uses actual companies, newest evidence, explicit willingness before heat, and never fills missing names", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: String(i), updatedAt: new Date(2026, 9, i + 1), insight: { ...emptyInsight("discover"), name: `Person ${i}`, company: `Company ${i}`, notes: "Manual reporting", commercial: { willingness: i === 0 ? "willing" : "considering", heat: i === 0 ? "cold" : "hot" } } }));
  const list = priorityCompanies(rows, [], []); assert.equal(list.length, 5); assert.equal(list[0]!.company, "Company 0");
  assert.equal(priorityCompanies(rows.slice(0, 2), [], []).length, 2);
  assert.equal(priorityCompanies([...rows.slice(0, 1), { ...rows[0]!, id: "new", updatedAt: new Date(2027, 1), insight: { ...rows[0]!.insight, company: " Ｃｏｍｐａｎｙ 0 ", name: "Latest" } }], [], []).length, 1);
  for (const zh of [true, false]) { const scripts = standardScripts({ name: "", company: "Acme", quote: "", amount: "", currency: "" }, zh); assert.equal(scripts.length, 7); assert(scripts.every(v => !v.includes("undefined"))); assert(scripts[3]!.includes("[")); }
});

test("Commercial workflow in isolated PostgreSQL: ownership, concurrency, private proof, analysis and atomic task completion", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 12 }) });
  const owner = await db.user.create({ data: { email: `commercial-${randomUUID()}@example.invalid`, trialPolicy: "interviews-3-v1", trialPlan: "enterprise", trialStartsAt: new Date(Date.now() - 1000), trialEndsAt: new Date(Date.now() + 86400000) } });
  const other = await db.user.create({ data: { email: `commercial-other-${randomUUID()}@example.invalid` } });
  const journey = await db.discoveryJourney.create({ data: { userId: owner.id } });
  const plan = await db.actionPlan.create({ data: { userId: owner.id, activeKey: owner.id, locale: "en", requestId: randomUUID(), companyStage: "MVP", stageReason: "QA", stageConfidence: 80, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "QA", bottleneckConfidence: 80 } });
  const base = { actionPlanId: plan.id, impact: "High", urgencyType: "immediate", difficulty: 1, actionTimeMinHours: 1, actionTimeMaxHours: 1, companyStage: "MVP", bottleneckGroup: "Sales", bottleneckCode: "no_icp", stageFit: 4, stageFitReason: "QA", bottleneckFit: 4, bottleneckFitReason: "QA", outcomeCategory: "customers", expectedOutcome: "At least one paid contract", outcomeTimeMinDays: 1, outcomeTimeMaxDays: 7 };
  const task = await db.actionItem.create({ data: { ...base, clientKey: "task_1", title: "Run paid pilot offer with 3 prospects" } });
  const nextTask = await db.actionItem.create({ data: { ...base, clientKey: "task_2", title: "Publish an update", dependencies: { create: { dependsOnId: task.id } } } });
  let uid: string | null = owner.id, failReward = false, aiFail = false, invent = false, noSources = false, fetchOnly = false, calls = 0, reservations = 0, refunds = 0, successes = 0, hold = false, release: (() => void) | null = null;
  let mutate: (() => Promise<void>) | null = null;
  const prospectFixtures = ["CircleWe", "EV Rapid Force", "KnownContact", "Old win", "Own Company", "Foreign Company", "New Taiwan Company"].map((name, i) => ({ name, aliases: [], website: `https://prospect${i}.example.com`, reason: "Potential software buyer; confirm need", taiwan: { url: `https://prospect${i}.example.com/about`, quote: "Taipei, Taiwan" }, fit: { url: `https://prospect${i}.example.com/about`, quote: "B2B software" } }));
  const require = createRequire(import.meta.url), cache = new Map<string, unknown>();
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/auth/guard": { getUserSession: async () => uid ? { uid } : null },
    "@/lib/auth/account": { getCurrentAccount: async () => uid ? await db.user.findUnique({ where: { id: uid } }) : null },
    "@/lib/rate-limit": { DAY_MS: 86400000, checkRateLimit: async () => ({ ok: true }) }, "@/lib/security/log": { logSecurityError() {} },
    "@/lib/getting-started/service": { completeGettingStarted: async () => {} },
    "@/lib/ai/allowance": { reserveAiUsage: async () => { reservations++; return randomUUID(); }, completeAiUsage: async (_id: string, success: boolean) => { if (success) successes++; else refunds++; } },
    "@/lib/playbook/quiz": { fortnightIndex: () => 0, periodEnd: () => new Date() },
    "@vercel/blob": { get: async () => ({ statusCode: 200, blob: { contentType: "application/pdf", size: 50 }, stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("%PDF-1.7\nQA")); c.close(); } }) }) },
    "@/lib/api": { ok: (data: unknown, status = 200) => Response.json({ data }, { status }), fail: (error: string, status = 400) => Response.json({ error }, { status }), unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }), failFromError: () => Response.json({ error: "Safe failure" }, { status: 500 }) },
    "@anthropic-ai/sdk": class { messages = { create: async (input: { tools?: { name: string }[]; messages: { content: string }[] }) => {
      calls++; if (hold) await new Promise<void>(resolve => { release = resolve; }); if (aiFail) throw new Error("Injected timeout"); if (mutate) await mutate();
      if (input.tools?.[0]?.name === "web_search") return { stop_reason: fetchOnly ? "pause_turn" : "end_turn", content: [
        { type: "web_search_tool_result", content: prospectFixtures.map(c => ({ type: "web_search_result", url: `${c.taiwan.url}?utm_source=qa`, title: c.name })) },
        { type: "text", text: "Researched new Taiwan companies", citations: noSources || fetchOnly ? [] : prospectFixtures.map(c => ({ type: "web_search_result_location", url: c.taiwan.url, cited_text: invent ? "Unrelated business" : "Taipei, Taiwan. B2B software" })) },
        ...(fetchOnly ? prospectFixtures.map(c => ({ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: c.taiwan.url, content: { source: { type: "text", data: "Taipei, Taiwan.\nB2B software." } } } })) : []),
      ] };
      if (input.tools?.[0]?.name === "prospect_result") return { content: [{ type: "tool_use", input: { companies: prospectFixtures.map(c => { const sources = JSON.parse(input.messages[0]!.content).sources as { url: string; quote: string }[]; return { name: c.name, aliases: c.aliases, website: c.website, reason: c.reason, taiwanSource: sources.findIndex(s => s.url === c.taiwan.url), fitSource: sources.findIndex(s => s.url === c.fit.url && (s.quote.includes("B2B") || invent)) }; }) } }] };
      const content = JSON.parse(input.messages[0]!.content);
      const result = content.evidence ? { topics: [{ label: "Reporting pain", evidence: content.evidence.slice(0, 2).map((v: { id: string }) => ({ recordId: v.id, quote: invent ? "Invented quote" : "Manual reporting takes hours" })) }], nextMoves: ["Ask willing prospects about a paid pilot"] } : { items: [{ quote: invent ? "Invented" : content.rejection.quote, possibleReason: "Budget may be constrained; confirm", clarify: "What budget is available?", next: "Clarify budget" }], followUp: "Could we clarify your budget concern?" };
      return { content: [{ type: "tool_use", name: "validation_result", input: result }] };
    } }; },
  };
  function load<T>(file: string): T { const absolute = resolve(file); if (cache.has(absolute)) return cache.get(absolute) as T; const loaded = { exports: {} }; cache.set(absolute, loaded.exports); runInNewContext(ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Date, Error, SyntaxError, console, process: { env: { INVESTOR_BLOB_READ_WRITE_TOKEN: "qa-private" } }, Response, Request, URL, Headers, Buffer, ReadableStream, TextDecoder, TextEncoder, setTimeout, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(absolute), `${id}.ts`)) : require(id) }); cache.set(absolute, loaded.exports); return loaded.exports as T; }
  const gate = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts");
  mocks["@/lib/billing/gate"] = { ...gate, requirePlan: async () => { const account = uid && await db.user.findUnique({ where: { id: uid } }); return account && gate.getEffectivePlan({ ...account, plan: "free", trialPlan: account.trialPlan as never }) !== "free" ? account : null; } };
  const rewards = load<typeof import("../src/lib/rewards/service")>("src/lib/rewards/service.ts");
  mocks["@/lib/rewards/service"] = { ...rewards, awardReward: async (...args: Parameters<typeof rewards.awardReward>) => { if (failReward) throw new Error("Injected award failure"); return rewards.awardReward(...args); } };
  const service = load<typeof import("../src/lib/validation/service")>("src/lib/validation/service.ts"), analysis = load<typeof import("../src/lib/validation/analysis")>("src/lib/validation/analysis.ts");
  const api = load<typeof import("../src/app/api/pipeline/route")>("src/app/api/pipeline/route.ts"), tasks = load<typeof import("../src/app/api/action-plans/actions/[id]/route")>("src/app/api/action-plans/actions/[id]/route.ts"), evidence = load<typeof import("../src/app/api/pipeline/evidence/route")>("src/app/api/pipeline/evidence/route.ts");
  const req = (body: unknown = {}, query = "") => ({ url: `https://example.test/api/pipeline${query}`, nextUrl: new URL(`https://example.test/api/pipeline${query}`), headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), json: async () => body }) as never;
  const revision = async () => (await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision;
  const complete = async (id = task.id) => tasks.PATCH(req({ revision: await revision(), done: true }), { params: Promise.resolve({ id }) });
  const payload = (company = "Acme"): SalesMutation => salesMutationSchema.parse({ scope: { planId: plan.id }, requestId: randomUUID(), version: 0, company, name: "Founder", status: "considering", quote: "Interested", reason: "Need to consider", amount: "125.50", currency: "USD" });
  const account = async () => ({ ...await db.user.findUniqueOrThrow({ where: { id: owner.id } }), betaAccess: false }) as never;
  let current: SalesMutation = payload(), dealId = "";
  try {
    await t.test("Own workspace is private; normal trial and expired accounts cannot access paid flow", async () => {
      uid = null; assert.equal((await api.GET(req({}, `?planId=${plan.id}`))).status, 401);
      uid = other.id; assert.equal((await api.GET(req({}, `?planId=${plan.id}`))).status, 403);
      uid = owner.id; await db.user.update({ where: { id: owner.id }, data: { trialPlan: "pro" } }); assert.equal((await api.GET(req({}, `?planId=${plan.id}`))).status, 403);
      await db.user.update({ where: { id: owner.id }, data: { trialPlan: "enterprise", trialEndsAt: new Date(Date.now() - 1000) } }); assert.equal((await api.POST(req(current))).status, 403);
      await db.user.update({ where: { id: owner.id }, data: { trialEndsAt: new Date(Date.now() + 86400000) } }); assert.equal((await api.GET(req({}, `?planId=${plan.id}`))).status, 200);
      await assert.rejects(service.validationSnapshot(other.id, { planId: plan.id }));
    });
    await t.test("Interest, legacy won and agreed do not complete; manual quantity and old pilot form are rejected", async () => {
      await db.deal.create({ data: { userId: owner.id, title: "Old win", stage: "won", value: 999 } });
      assert.equal((await complete()).status, 409);
      assert.equal((await tasks.PATCH(req({ revision: await revision(), recordingMode: "interview", metricTarget: 1 }), { params: Promise.resolve({ id: task.id }) })).status, 409);
      const edit = { title: "Document next result", impact: "High", urgencyType: "immediate", urgencyDays: null, dependencyLevel: 0, dependencyNotes: null, difficulty: 1, actionTime: { minMinutes: 60, maxMinutes: 60 }, companyStage: "MVP", stageFit: { score: 4, reason: "QA evidence", confidence: null }, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckFit: { score: 4, reason: "QA evidence", confidence: null }, outcomeCategory: "customers", expectedOutcome: "At least one paid contract", outcomeTime: { min: 1, max: 7 }, dependencyActionIds: [] };
      assert.equal((await tasks.PATCH(req({ revision: await revision(), ...edit }), { params: Promise.resolve({ id: task.id }) })).status, 200);
      assert.equal((await complete()).status, 409, "Renaming must not bypass proof requirements");
      await db.actionItem.update({ where: { id: task.id }, data: { metricTarget: 1, metricCurrent: 0, metricUnit: "companies" } });
      const checkIns = load<typeof import("../src/lib/check-ins/service")>("src/lib/check-ins/service.ts");
      await assert.rejects(checkIns.saveCheckIn(owner.id, { action: "save", planId: plan.id, planRevision: await revision(), weekStart: taipeiWeek(), revision: 0, requestId: randomUUID(), finding: "QA weekly finding", blockers: "", metrics: [{ actionId: task.id, current: 1 }] }));
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).metricCurrent, 0);

      assert.equal((await tasks.PATCH(req({ revision: await revision(), metricTarget: 1, metricCurrent: 1, metricUnit: "companies" }), { params: Promise.resolve({ id: task.id }) })).status, 409);
      assert.equal((await tasks.PATCH(req({ revision: await revision(), taskWorkspace: { kind: "pilot", prospects: [{ leadId: "x", offer: "125", response: "agreed", reason: "Yes" }] } }), { params: Promise.resolve({ id: task.id }) })).status, 409);
      const res = await api.POST(req(current)); assert.equal(res.status, 200); const snapshot = (await res.json()).data; dealId = snapshot.deals[0].id;
      assert.equal(snapshot.summary.total, 0); assert.equal((await complete()).status, 409);
    });
    await t.test("Replay has one event; changed-body replay and parallel stale versions cannot overwrite", async () => {
      assert.equal((await api.POST(req(current))).status, 200);
      assert.equal(salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).validation).events.length, 1);
      assert.equal((await api.POST(req({ ...current, quote: "Different" }))).status, 409);
      const a = { ...current, requestId: randomUUID(), version: 1, quote: "A" }, b = { ...a, requestId: randomUUID(), quote: "B" };
      const results = await Promise.all([api.POST(req(a)), api.POST(req(b))]); assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
      const saved = salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).validation);
      current = { ...current, requestId: randomUUID(), version: saved.version };
    });
    await t.test("Positive amount and private owned proof required; signed then paid counts one company and separate amounts", async () => {
      assert.equal((await api.POST(req({ ...current, status: "paid" }))).status, 400);
      assert.equal((await api.POST(req({ ...current, status: "paid", proof: { ...proof("paid"), amount: "0" } }))).status, 400);
      assert.equal((await api.POST(req({ ...current, status: "paid", proof: proof("paid") }))).status, 403);
      const p = { ...proof(), pathname: `commercial-evidence/${owner.id}/${randomUUID()}.pdf` };
      assert.equal((await api.POST(req({ ...current, status: "signed", proof: p }))).status, 200);
      current = { ...current, requestId: randomUUID(), version: current.version + 1, status: "paid", proof: { ...proof("paid"), pathname: `commercial-evidence/${owner.id}/${randomUUID()}.pdf` } };
      assert.equal((await api.POST(req(current))).status, 200);
      const snapshot = await service.validationSnapshot(owner.id, { planId: plan.id }); assert.equal(snapshot.summary.total, 1); assert.equal(snapshot.summary.signed, 1); assert.equal(snapshot.summary.paid, 1);
      assert.equal(snapshot.summary.amounts.USD?.paid, 12550); assert.equal(snapshot.summary.amounts.USD?.signed, 12550);
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).metricCurrent, 1);
      const cross = await api.POST(req({ ...payload("Beta"), status: "paid", proof: current.proof })); assert.equal(cross.status, 409);
      uid = other.id; assert.equal((await evidence.GET(req({}, `?dealId=${dealId}&proofId=${p.id}`))).status, 404); uid = owner.id;
      assert.equal((await evidence.GET(req({}, `?dealId=${dealId}&proofId=${p.id}`))).status, 200);
    });
    await t.test("Task completion and reward roll back together; repeated completion awards once", async () => {
      failReward = true; assert.equal((await complete()).status, 500); failReward = false;
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).done, false);
      assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action" } }), 0);
      assert.equal((await complete()).status, 200); assert.equal((await complete()).status, 200);
      assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action" } }), 1);
    });
    await t.test("Refund / void removes counting, keeps completion and points, blocks new unfinished dependent tasks", async () => {
      let saved = salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).validation);
      for (const p of saved.proofs) { await service.saveSalesRecord(owner.id, { ...payload(), requestId: randomUUID(), version: saved.version, status: "considering", revoke: { id: p.id, reason: "Refund / void" } }); saved = salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).validation); }
      const snapshot = await service.validationSnapshot(owner.id, { planId: plan.id }); assert.equal(snapshot.summary.total, 0); assert.equal(snapshot.tasks[0]?.needsConfirmation, true);
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: task.id } })).done, true); assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action" } }), 1);
      assert.equal((await complete(nextTask.id)).status, 409);
      const stage = await db.planMilestone.create({ data: { actionPlanId: plan.id, position: 0, title: "First sale", expectedOutcome: "Paid commitment", acceptanceCriteria: "One proof", targetDate: new Date("2026-11-01") } });
      await db.actionItem.update({ where: { id: task.id }, data: { milestoneId: stage.id } });
      const roadmap = load<typeof import("../src/lib/roadmap/service")>("src/lib/roadmap/service.ts");
      await assert.rejects(roadmap.confirmMilestone(owner.id, stage.id, { revision: await revision(), achieved: true, outcomeNote: "The old outcome no longer has valid evidence" }));
      saved = salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).validation);
      await service.saveSalesRecord(owner.id, { ...payload(), version: saved.version, status: "paid", proof: { ...proof("paid"), pathname: `commercial-evidence/${owner.id}/${randomUUID()}.pdf` } });
      assert.equal((await complete(nextTask.id)).status, 409, "Restoring proof still requires explicit outcome reconfirmation");
      assert.equal((await complete()).status, 200);
      assert.equal(await db.rewardEntry.count({ where: { userId: owner.id, kind: "action" } }), 1, "Reconfirmation never re-awards points");
      assert.equal((await complete(nextTask.id)).status, 200);

    });
    await t.test("Journey links require ownership and explicit version; canonical interviews are not copied", async () => {
      await assert.rejects(service.linkJourney(owner.id, plan.id, "foreign", await revision()));
      for (let i = 0; i < 10; i++) await db.meetingNote.create({ data: { userId: owner.id, title: `Founder ${i}`, insight: { ...emptyInsight("discover"), journeyId: journey.id, company: `Company ${i}`, name: `Founder ${i}`, notes: "Manual reporting takes hours" } } });
      await service.linkJourney(owner.id, plan.id, journey.id, await revision());
      const snapshot = await service.validationSnapshot(owner.id, { planId: plan.id }); assert.equal(snapshot.rows.length, 10); assert.equal(snapshot.priority.length, 5);
      assert(snapshot.rows.every(r => !(r.insight as { actionId?: string }).actionId)); assert.equal(await db.meetingNote.count({ where: { userId: owner.id } }), 10);
      const borrowed = await db.actionItem.create({ data: { ...base, clientKey: "task_3", title: "Interview 10 startups", recordingMode: "interview", metricTarget: 10 } });
      const interviews = load<typeof import("../src/lib/customer-insights/service")>("src/lib/customer-insights/service.ts"); await db.$transaction(tx => interviews.assertInterviewComplete(tx as never, owner.id, borrowed));
      assert.equal((await db.actionItem.findUniqueOrThrow({ where: { id: borrowed.id } })).metricCurrent, 10);
    });
    await t.test("3 / 6 / 10 analysis uses quoted evidence, optional stages and same-source cache; only paid analyses charge", async () => {
      const args = { scope: { planId: plan.id }, milestone: 3 as const, locale: "en" as const };
      const first = await analysis.analyseValidation(await account(), args) as { topics: unknown[]; total: number }; assert.equal(first.total, 3); assert.equal(first.topics.length, 1); assert.equal(reservations, 0);
      const before = calls; await analysis.analyseValidation(await account(), args); assert.equal(calls, before);
      await analysis.analyseValidation(await account(), { ...args, milestone: 10 }); assert.equal(reservations, 1); // No forced 6-company purchase.
      await analysis.analyseValidation(await account(), { ...args, milestone: 6 }); assert.equal(reservations, 2);
      await assert.rejects(analysis.analyseValidation(await account(), { ...args, scope: { journeyId: "foreign" } }));
    });
    await t.test("Concurrent analyses share claim; invalid evidence / provider failure / changed records refund and invalidate cache", async () => {
      const row = await db.meetingNote.findFirstOrThrow({ where: { userId: owner.id } }); await db.meetingNote.update({ where: { id: row.id }, data: { body: "edited", updatedAt: new Date(Date.now() + 1000) } });
      const args = { scope: { planId: plan.id }, milestone: 6 as const, locale: "en" as const };
      hold = true; const pending = analysis.analyseValidation(await account(), args); const deadline = Date.now() + 5000;
      while (!release && Date.now() < deadline) await new Promise(r => setTimeout(r, 5)); assert(release);
      await assert.rejects(analysis.analyseValidation(await account(), args)); hold = false; (release as () => void)(); release = null; await pending;
      await db.meetingNote.update({ where: { id: row.id }, data: { updatedAt: new Date(Date.now() + 2000) } });
      const before = refunds; invent = true; await assert.rejects(analysis.analyseValidation(await account(), args)); invent = false; assert.equal(refunds, before + 1);
      aiFail = true; await assert.rejects(analysis.analyseValidation(await account(), args)); aiFail = false; assert.equal(refunds, before + 2);
      mutate = async () => { await db.meetingNote.update({ where: { id: row.id }, data: { updatedAt: new Date(Date.now() + 3000) } }); }; await assert.rejects(analysis.analyseValidation(await account(), args)); mutate = null; assert.equal(refunds, before + 3);
      await analysis.analyseValidation(await account(), args); assert(successes > 0);
    });
    await t.test("New Taiwan prospects exclude all owned companies, cache separately, remove newly recorded companies and refund failures", async () => {
      const prospects = load<typeof import("../src/lib/validation/prospects")>("src/lib/validation/prospects.ts");
      const args = { scope: { planId: plan.id }, prospectCount: 6 as const, locale: "en" as const };
      const before = reservations;
      await assert.rejects(prospects.generateProspects(await account(), args), /ICP/); assert.equal(reservations, before);
      await db.onboardingProfile.create({ data: { userId: owner.id, companyName: "Own Company", website: "https://own.example.com/?token=private-qa-test", oneLinePitch: "B2B reporting software for Taiwan companies", targetMarkets: [], needs: [] } });
      await db.meetingNote.create({ data: { userId: owner.id, title: "Legacy unlinked note", insight: { company: "CircleWe" } } });
      await db.meetingNote.create({ data: { userId: owner.id, title: "Other workspace", insight: { company: "EV Rapid Force" } } });
      await db.contact.create({ data: { userId: owner.id, name: "Known", company: "KnownContact" } });
      await db.contact.create({ data: { userId: other.id, name: "Other owner", company: "Foreign Company" } });
      await assert.rejects(prospects.generateProspects(await account(), { ...args, scope: { journeyId: "foreign" } }));
      await db.user.update({ where: { id: owner.id }, data: { trialPlan: "pro" } }); await assert.rejects(prospects.generateProspects(await account(), args));
      await db.user.update({ where: { id: owner.id }, data: { trialPlan: "enterprise" } });
      const context = await service.prospectContext(db as never, owner.id, args.scope); assert.equal(context.excluded.some(v => v.includes("private-qa-test")), false);
      const first = await prospects.generateProspects(await account(), args); assert(first);
      assert.deepEqual(Array.from(first.companies, c => c.name), ["Foreign Company", "New Taiwan Company"]); assert.equal(reservations, before + 1);
      const after = calls; await prospects.generateProspects(await account(), args); assert.equal(calls, after);
      const cache = (await db.actionPlan.findUniqueOrThrow({ where: { id: plan.id } })).validationAnalysis as { reports: unknown }; assert(cache.reports, "Pain analysis cache retained");
      await db.meetingNote.updateMany({ where: { userId: owner.id }, data: { updatedAt: new Date() } });
      await analysis.analyseValidation(await account(), { scope: args.scope, milestone: 3, locale: "en" });
      assert((await service.currentProspects(db as never, owner.id, args.scope))["6:en"], "Analysing interviews retains prospect cache");
      await db.contact.create({ data: { userId: owner.id, name: "Now contacted", company: "New Taiwan Company Ltd." } });
      const filtered = (await service.validationSnapshot(owner.id, args.scope)).prospects["6:en"]!;
      assert(filtered.stale); assert.deepEqual(Array.from(filtered.companies, c => c.name), ["Foreign Company"]);
      const refundsBefore = refunds; aiFail = true; await assert.rejects(prospects.generateProspects(await account(), args)); aiFail = false; assert.equal(refunds, refundsBefore + 1);
      noSources = true; await assert.rejects(prospects.generateProspects(await account(), args)); noSources = false; assert.equal(refunds, refundsBefore + 2);
      invent = true; await assert.rejects(prospects.generateProspects(await account(), args)); invent = false; assert.equal(refunds, refundsBefore + 3);
      mutate = async () => { await db.onboardingProfile.update({ where: { userId: owner.id }, data: { icp: "New criteria" } }); };
      await assert.rejects(prospects.generateProspects(await account(), args)); mutate = null; assert.equal(refunds, refundsBefore + 4);
      hold = true; const pending = prospects.generateProspects(await account(), args); const deadline = Date.now() + 5000;
      while (!release && Date.now() < deadline) await new Promise(r => setTimeout(r, 5)); assert(release);
      await assert.rejects(prospects.generateProspects(await account(), args)); hold = false; (release as () => void)(); release = null; await pending;
      const ten = await prospects.generateProspects(await account(), { ...args, prospectCount: 10 }); assert.equal(ten!.requested, 10); assert.equal(ten!.companies.length, 1);
      fetchOnly = true; const fetched = await prospects.generateProspects(await account(), { ...args, locale: "zh-tw" }); fetchOnly = false; assert.equal(fetched!.companies.length, 1);
    });
    await t.test("Rejection analysis requires exact reason and quote, refunds failures and caches unchanged reply", async () => {
      let saved = salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).validation);
      await service.saveSalesRecord(owner.id, { ...payload(), version: saved.version, status: "declined", quote: "", reason: "" });
      const args = { scope: { planId: plan.id }, dealId, locale: "en" as const };
      const before = reservations; await assert.rejects(analysis.analyseValidation(await account(), args)); assert.equal(reservations, before);
      saved = salesRecordSchema.parse((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).validation);
      await service.saveSalesRecord(owner.id, { ...payload(), version: saved.version, status: "declined", quote: "No budget this quarter", reason: "Budget not approved" });
      await analysis.analyseValidation(await account(), args); const after = calls; await analysis.analyseValidation(await account(), args); assert.equal(calls, after);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } }); await db.$disconnect(); }
});
