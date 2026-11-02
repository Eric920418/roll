import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DIAGNOSTIC_QUESTIONS } from "../src/lib/action-plan/builder-draft";
import { readDiscoverySetup } from "../src/lib/discovery/policy";
import { planContent } from "../src/lib/billing/catalog";

function loader(mocks: Record<string, unknown>) {
  const native = createRequire(import.meta.url), cache = new Map<string, { exports: unknown }>();
  function load<T>(file: string): T {
    const path = resolve(file); if (cache.has(path)) return cache.get(path)!.exports as T;
    const mod = { exports: {} }; cache.set(path, mod);
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
      module: mod, exports: mod.exports, process, console, Date, Error, SyntaxError, URL, Request, Response, Headers, Buffer, setTimeout, clearTimeout,
      require: (id: string) => id in mocks ? mocks[id] : id === "server-only" ? {} : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(resolve(dirname(path), `${id}.ts`)) : native(id),
    });
    return mod.exports as T;
  }
  return load;
}
const diagnosis = { companyStage: "MVP", stageReason: "A working prototype is ready", stageConfidence: 70, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "Your answers describe unclear target buyers", bottleneckConfidence: 60 };
const input = () => ({ requestId: randomUUID(), locale: "en" as const, answers: DIAGNOSTIC_QUESTIONS.en.map(question => ({ question, answer: "We have an MVP and want to validate our first paying customers." })) });

test("Free plan keeps the 14-day / three-company entitlement and bilingual signup copy", () => {
  assert(planContent(false).free.features.some(v => v.includes("14-day / 3-company")));
  for (const locale of ["en", "zh-tw"]) {
    const copy = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    assert.match(copy.Auth.company.website, /optional|選填/);
    assert.match(copy.Auth.signup.rollonCode, /optional|選填/);
    assert.match(copy.Quiz.growthResult.finish, /journey|創業旅程/);
  }
});

test("New trial workspace presents questions before interview tasks; paid users get an expanded builder", async () => {
  const native = createRequire(import.meta.url), account = { id: "qa", trialPolicy: "interviews-3-v1" };
  let stateCalls = 0;
  const snapshot = { journeyId: null, version: 0, setup: null, active: true, paid: false, total: 0, target: 3, preview: null };
  const mocks: Record<string, unknown> = {
    react: { ...native("react"), useState: (value: unknown) => [stateCalls++ === 0 ? snapshot : value, () => {}], useEffect() {}, useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }) },
    "next-intl": { useLocale: () => "en" }, "next/link": "Link", "@/lib/discovery/policy": { discoveryReportSchema: { safeParse: () => ({}) } },
    "../ActionPlanBuilder": "ActionPlanBuilder", "../NextStepsTour": "NextStepsTour", "../CustomerDiscovery": "CustomerDiscovery", "../prospecting/ProspectSearch": "ProspectSearch", "../ValidationWorkspace": "ValidationWorkspace", "../LearningResources": "LearningResources", "./FounderOffer": "FounderOffer",
  };
  const walk = (node: unknown, parents: unknown[] = []): { type: unknown; props: Record<string, unknown>; parents: unknown[] }[] => {
    if (!node || typeof node !== "object") return [];
    const n = node as { type: unknown; props?: Record<string, unknown> };
    return [{ type: n.type, props: n.props || {}, parents }, ...[n.props?.children].flat(Infinity).flatMap(child => walk(child, [...parents, n.type]))];
  };
  const trial = loader(mocks)<{ default(p: unknown): unknown }>("src/components/dashboard/discovery/DiscoveryJourney.tsx");
  const tree = walk(trial.default({ userId: account.id, compactTrial: true }));
  assert(tree.some(n => n.type === "ActionPlanBuilder" && n.props.autoOpen === true && n.props.discoveryTrial === true));
  assert(!tree.some(n => n.type === "CustomerDiscovery"));
  const components = ["InvestorProgress", "NextStepsTour", "ConversationHistory", "GettingStartedHint", "AgendaBoard", "PlanPaywall", "DiscoveryJourney"];
  const pageMocks = Object.fromEntries(components.map(name => [name === "InvestorProgress" ? "@/components/dashboard/network/NetworkPanels" : name === "DiscoveryJourney" ? "@/components/dashboard/discovery/DiscoveryJourney" : `@/components/dashboard/${name}`, name === "InvestorProgress" ? { InvestorProgress: name } : name]));
  const page = loader({ ...pageMocks, "@/lib/auth/guard": { requireUserPage: async () => account }, "next-intl/server": { setRequestLocale() {}, getTranslations: async () => (key: string) => key }, "@/lib/billing/gate": { requirePlan: async () => account }, "@/lib/auth/account": { getCurrentAccount: async () => account }, "@/lib/discovery/policy": { isDiscoveryMember: () => true }, "@/lib/discovery/service": { getDiscoverySnapshot: async () => snapshot }, "@/lib/action-plan/service": { getActiveActionPlan: async () => null } })<{ default(p: unknown): Promise<unknown> }>("src/app/[locale]/dashboard/(shell)/agenda/page.tsx");
  const paid = walk(await page.default({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));
  assert(paid.some(n => n.type === "AgendaBoard" && n.props.guided === true && !n.parents.includes("details")));
  assert(!paid.some(n => n.type === "DiscoveryJourney" || n.type === "NextStepsTour"));
});

test("Trial setup is private, bounded, cached, explicitly confirmed and cannot grant paid tasks", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.ROLL_REWARDS_TEST_DATABASE_URL!); assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, max: 8 }) });
  const ids: string[] = []; let uid: string | null = null, calls = 0, fail = false, allowed = true, paid = false, pending: Promise<void> | null = null;
  class WriteError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const member = async () => { const row = await db.user.create({ data: { email: `setup-${randomUUID()}@example.invalid`, trialPolicy: "interviews-3-v1", trialPlan: "pro", trialStartsAt: new Date(Date.now() - 1000), trialEndsAt: new Date(Date.now() + 14 * 86400000) } }); ids.push(row.id); return row; };
  const account = async () => uid ? { ...await db.user.findUniqueOrThrow({ where: { id: uid } }), profile: null } : null;
  const load = loader({ "@/lib/prisma": { prisma: db }, "@/lib/auth/account": { getCurrentAccount: account }, "@/lib/auth/guard": { getUserSession: async () => uid ? { uid } : null }, "@/lib/billing/gate": { requirePlan: async () => null, getEffectivePlan: () => paid ? "pro" : "free" }, "@/lib/action-plan/service": { PlanWriteError: WriteError }, "@/lib/customer-insights/service": {}, "@/lib/validation/service": {}, "@/lib/quiz/result": { getLatestQuizResult: async () => null }, "@/lib/security/http": { browserMutationGuard: () => null }, "@/lib/rate-limit": { DAY_MS: 86400000, checkRateLimit: async (...args: Parameters<typeof import("../src/lib/rate-limit").checkRateLimit>) => allowed ? limiter.checkRateLimit(...args) : { ok: false } }, "@/lib/action-plan/ai": { diagnoseActionPlan: async (request: { answers: unknown[]; messages: unknown[] }) => { calls++; assert.equal(request.answers.length, 3); assert.equal(request.messages.length, 0); if (pending) await pending; if (fail) throw Error("Injected analysis failure"); return { status: "ready", diagnosis }; } }, "@/lib/ai/allowance": { reserveAiUsage: () => { throw Error("Must not grant or consume monthly AI credit"); } }, "@anthropic-ai/sdk": class { constructor() { throw Error("Unexpected direct paid AI call"); } }, "@/lib/api": { ok: (data: unknown, status = 200) => Response.json({ data }, { status }), fail: (error: string, status = 400) => Response.json({ error }, { status }), unauthorized: () => Response.json({}, { status: 401 }), failFromError: () => Response.json({ error: "Safe error" }, { status: 500 }) } });
  const limiter: typeof import("../src/lib/rate-limit") = load("src/lib/rate-limit.ts");
  const setup = load<typeof import("../src/lib/discovery/setup")>("src/lib/discovery/setup.ts"), service = load<typeof import("../src/lib/discovery/service")>("src/lib/discovery/service.ts");
  const diagnose = load<typeof import("../src/app/api/action-plans/diagnose/route")>("src/app/api/action-plans/diagnose/route.ts"), generate = load<typeof import("../src/app/api/action-plans/generate/route")>("src/app/api/action-plans/generate/route.ts"), discovery = load<typeof import("../src/app/api/discovery/route")>("src/app/api/discovery/route.ts");
  const req = (body: unknown) => ({ json: async () => body }) as never;
  try {
    const owner = await member(), body = input();
    await t.test("No session or expired trial is rejected; empty start cannot bypass the questions", async () => {
      assert.equal((await diagnose.POST(req(body))).status, 401); uid = owner.id;
      assert.equal((await discovery.POST(req({}))).status, 409); assert.equal(await db.discoveryJourney.count({ where: { userId: uid } }), 0);
      assert.equal((await diagnose.POST(req({ ...body, answers: [{ question: "q", answer: " " }] }))).status, 400);
      const first = await diagnose.POST(req({ ...body, answers: body.answers.slice(0, 1) })); assert.equal(first.status, 200); assert.equal((await first.json()).data.question, DIAGNOSTIC_QUESTIONS.en[1]); assert.equal(calls, 0);
    });
    await t.test("Three answers produce one cached diagnosis; altered diagnosis and unconfirmed interviews fail", async () => {
      const empty = await db.discoveryJourney.create({ data: { userId: owner.id } });
      assert.equal((await service.getDiscoverySnapshot(owner.id)).needsSetup, true);
      await assert.rejects(db.$transaction(tx => service.lockDiscoveryWrite(tx, owner.id, empty.id, true)), /confirm|確認/);
      assert.equal((await diagnose.POST(req(body))).status, 200); assert.equal(calls, 1);
      assert.equal((await diagnose.POST(req(body))).status, 200); assert.equal(calls, 1);
      const snapshot = await service.getDiscoverySnapshot(owner.id); assert.equal(snapshot.canCreate, false); assert.equal(snapshot.target, 3);
      await assert.rejects(db.$transaction(tx => service.lockDiscoveryWrite(tx, owner.id, snapshot.journeyId!, true)), /confirm|確認/);
      const request = { ...body, diagnosis, candidateCount: 5 };
      assert.equal((await generate.POST(req({ ...request, diagnosis: { ...diagnosis, stageReason: "Forged different reason" } }))).status, 409);
      const result = await generate.POST(req(request)); assert.equal(result.status, 201); assert.equal((await result.json()).data.canCreate, true);
      await db.$transaction(tx => service.lockDiscoveryWrite(tx, owner.id, snapshot.journeyId!, true));
      const version = (await service.getDiscoverySnapshot(owner.id)).version;
      assert.equal((await generate.POST(req(request))).status, 201); assert.equal((await service.getDiscoverySnapshot(owner.id)).version, version);
      assert.equal(await setup.discoverySetupResult(owner.id, body.requestId), snapshot.journeyId);
      const stranger = await member(); assert.equal(await setup.discoverySetupResult(stranger.id, body.requestId), null);
      assert.equal(await db.actionPlan.count({ where: { userId: owner.id } }), 0); assert.equal(await db.aiAllowance.count({ where: { userId: owner.id } }), 0);
    });
    await t.test("Correcting the provider workspace keeps old failed counters and enforces the new daily cap", async () => {
      const other = await member(); uid = other.id;
      const oldKey = `discovery:setup:${other.id}`;
      await db.rateCounter.create({ data: { key: oldKey, count: 3, windowStart: new Date() } });
      const previous = process.env.ANTHROPIC_WORKSPACE_ID; process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_fundedQA";
      try {
        for (let i = 0; i < 3; i++) await setup.prepareDiscoverySetup(await account() as never, input());
        await assert.rejects(setup.prepareDiscoverySetup(await account() as never, input()), /limit|上限/);
        process.env.ANTHROPIC_WORKSPACE_ID = " \nwrkspc_fundedQA\n ";
        await assert.rejects(setup.prepareDiscoverySetup(await account() as never, input()), /limit|上限/);
        assert.equal((await db.rateCounter.findUniqueOrThrow({ where: { key: oldKey } })).count, 3);
        const counters = await db.rateCounter.findMany({ where: { key: { contains: other.id } } });
        assert.equal(counters.length, 2); assert(counters.every(row => row.count === 3));
      } finally { if (previous === undefined) delete process.env.ANTHROPIC_WORKSPACE_ID; else process.env.ANTHROPIC_WORKSPACE_ID = previous; }
    });
    await t.test("Paid legacy entry needs a confirmed three-answer plan before creating a workspace", async () => {
      const other = await member(); uid = other.id; paid = true;
      assert.equal((await discovery.POST(req({}))).status, 409);
      assert.equal((await service.getDiscoverySnapshot(uid)).canStart, false);
      await db.actionPlan.create({ data: { userId: uid, activeKey: uid, requestId: randomUUID(), locale: "en", ...diagnosis, diagnosticAnswers: input().answers } });
      assert.equal((await service.getDiscoverySnapshot(uid)).canStart, true);
      assert.equal((await discovery.POST(req({}))).status, 200);
      assert.equal((await service.getDiscoverySnapshot(uid)).canCreate, true);
      paid = false;
    });
    await t.test("Existing legacy interviews remain available without fabricated setup answers", async () => {
      const other = await member(); uid = other.id;
      const old = await db.discoveryJourney.create({ data: { userId: uid } });
      await db.meetingNote.create({ data: { userId: uid, title: "Existing interview", insight: { company: "Legacy buyer", notes: "A saved actual interview", journeyId: old.id } } });
      const snapshot = await service.getDiscoverySnapshot(uid);
      assert.equal(snapshot.setup, null); assert.equal(snapshot.needsSetup, false); assert.equal(snapshot.canCreate, true);
      await db.$transaction(tx => service.lockDiscoveryWrite(tx, other.id, old.id, true));
    });
    await t.test("Parallel analysis holds one lease, failures keep answers, and expiry cannot be confirmed", async () => {
      const other = await member(); uid = other.id; const next = input(); fail = true;
      await assert.rejects(setup.prepareDiscoverySetup(await account() as never, next), /Injected/); fail = false;
      const failed = await db.discoveryJourney.findUniqueOrThrow({ where: { userId: uid } }); assert.equal(failed.analysisToken, null); assert.equal(readDiscoverySetup(failed.setup)?.answers.length, 3);
      let release!: () => void; pending = new Promise<void>(resolve => { release = resolve; });
      const running = setup.prepareDiscoverySetup(await account() as never, next);
      for (let i = 0; i < 50; i++) { if ((await db.discoveryJourney.findUniqueOrThrow({ where: { userId: uid } })).analysisToken) break; await new Promise(resolve => setTimeout(resolve, 10)); }
      await assert.rejects(setup.prepareDiscoverySetup(await account() as never, next), /processing|處理/); release(); await running; pending = null;
      await db.user.update({ where: { id: uid }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
      assert.equal((await generate.POST(req({ ...next, diagnosis }))).status, 403);
      assert.equal(readDiscoverySetup((await db.discoveryJourney.findUniqueOrThrow({ where: { userId: uid } })).setup)?.confirmed, false);
      const limited = await member(); uid = limited.id; allowed = false;
      await assert.rejects(setup.prepareDiscoverySetup(await account() as never, input()), /limit|上限/); allowed = true;
      assert.equal(await db.discoveryJourney.count({ where: { userId: uid } }), 0);
    });
  } finally { await db.rateCounter.deleteMany({ where: { OR: ids.map(id => ({ key: { contains: id } })) } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});
