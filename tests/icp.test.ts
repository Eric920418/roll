import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { EMPTY_ICP, ICP_FIELDS, nextIcpQuestion, profilePatchSchema, readIcp, hasIcp, type IcpDraft, type IcpMessage } from "../src/lib/icp/schema";
import type { Account } from "../src/lib/auth/account";

const require = createRequire(import.meta.url);
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const loaded = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, require: (id: string) => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id),
    console: { error() {} }, process: { env: {} }, Date, Set, JSON, Object, Error,
  });
  return loaded.exports as T;
}
const schema = { EMPTY_ICP, ICP_FIELDS, nextIcpQuestion, readIcp, hasIcp };
const draft = { ...EMPTY_ICP, summary: "Founders without paying customers", who: "Founders", problem: "No paying customers" };
const user = (id: string) => ({ id, profile: { companyName: "Keep me", country: "Taiwan", icp: "Original hypothesis" } }) as Account;

test("Profile PATCH omission preserves fields; invalid URLs/stage/ICP rejected", () => {
  const result = profilePatchSchema.parse({ companyName: "Changed" });
  assert.deepEqual(result, { companyName: "Changed" });
  assert.equal(profilePatchSchema.parse({ website: "example.com" }).website, "https://example.com/");
  assert.equal(profilePatchSchema.parse({ website: "" }).website, null);
  assert.equal(profilePatchSchema.safeParse({ website: "https://" }).success, false);
  assert.equal(profilePatchSchema.safeParse({ companyStage: "Made up" }).success, false);
  assert.equal(profilePatchSchema.safeParse({ icp: "stale form" }).success, false);
  assert.equal(readIcp({ ...EMPTY_ICP, summary: "x".repeat(2000) })?.summary.length, 2000);
  assert.equal(readIcp({ ...EMPTY_ICP, who: "x".repeat(501) }), null);
});

test("ICP questions use distinct topics and stop after three answers", () => {
  const messages: IcpMessage[] = [];
  for (let round = 0; round < 3; round++) {
    const question = nextIcpQuestion(null, messages, "en")!;
    assert.equal(question.topic, round);
    messages.push(question, { role: "user", content: `Answer ${round}` });
  }
  assert.equal(nextIcpQuestion(null, messages, "en"), null);
  assert.equal(nextIcpQuestion({ ...draft, workaround: "Courses", channels: "Events" }, [messages[0], messages[1]], "en")?.topic, 2);
});

test("AI facts require verbatim user evidence; company geography is not evidence", () => {
  const { groundedDraft } = load<{ groundedDraft: (raw: unknown, sources: string[]) => IcpDraft }>("src/lib/icp/ai.ts", { "./schema": schema });
  const raw = Object.fromEntries(["summary", ...ICP_FIELDS].map(key => [key, { value: "", evidence: "" }]));
  raw.who = { value: "Founders", evidence: "Founders with an MVP" };
  raw.location = { value: "Taiwan", evidence: "Taiwan" };
  const result = groundedDraft(raw, ["Founders with an MVP but no paying customers"]);
  assert.equal(result.who, "Founders");
  assert.equal(result.location, "");
  assert.equal(result.stage, "");
  assert.throws(() => groundedDraft({ who: "wrong format" }, []));
});

function harness() {
  type Row = Record<string, unknown>;
  const profiles = new Map<string, Row>([["a", { userId: "a", companyName: "Keep me", country: "Taiwan", needs: ["legal"], icp: "Old ICP", icpVersion: 0, icpDetails: null }]]);
  const workspaces = new Map<string, Row>();
  const same = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  function table(rows: Map<string, Row>, workspace = false) {
    return {
      async findUnique({ where }: { where: Row }) { return rows.get(where.userId as string) ?? null; },
      async findUniqueOrThrow({ where }: { where: Row }) { const row = rows.get(where.userId as string); if (!row) throw Error("not found"); return row; },
      async upsert({ where, create }: { where: Row; create: Row }) {
        if (!rows.has(where.userId as string)) rows.set(where.userId as string, workspace ? { revision: 0, draft: null, pendingRequestId: null, pendingSince: null, lastRequestId: null, lastError: null, usageId: null, ...create } : { icpVersion: 0, icpDetails: null, ...create });
        return rows.get(where.userId as string)!;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const row = rows.get(where.userId as string); if (!row || !same(row, where)) return { count: 0 };
        for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? Number(row[key]) + Number((value as { increment: number }).increment) : value;
        return { count: 1 };
      },
      async update({ where, data }: { where: Row; data: Row }) { Object.assign(rows.get(where.userId as string)!, data); },
    };
  }
  let reservations = 0;
  const completions: boolean[] = [];
  let generate = async () => draft;
  let allowance = true;
  const db = {
    icpWorkspace: table(workspaces, true), onboardingProfile: table(profiles),
    async $transaction(fn: (tx: unknown) => Promise<void>) {
      const p = structuredClone(profiles), w = structuredClone(workspaces);
      try { await fn(db); } catch (error) { profiles.clear(); p.forEach((v,k) => profiles.set(k,v)); workspaces.clear(); w.forEach((v,k) => workspaces.set(k,v)); throw error; }
    },
  };
  const api = load<{
    getIcpWorkspace(id: string, locale: string): Promise<{ revision: number; draft: IcpDraft | null; messages: IcpMessage[]; saved: IcpDraft | null; profileVersion: number }>;
    runIcp(account: Account, input: object): Promise<unknown>;
    patchIcp(id: string, input: object): Promise<unknown>;
  }>("src/lib/icp/service.ts", {
    "@/lib/prisma": { prisma: db }, "./schema": schema,
    "@/lib/ai/allowance": { reserveAiUsage: async () => { reservations++; return allowance ? "usage" : null; }, completeAiUsage: async (_id: string, success: boolean) => { completions.push(success); } },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ ok: true }), DAY_MS: 86400000 },
    "./ai": { generateIcp: () => generate(), IcpAiError: class extends Error {} },
  });
  return { api, profiles, workspaces, completions, reservations: () => reservations, generate: (fn: () => Promise<IcpDraft>) => { generate = fn; }, exhaust: () => { allowance = false; } };
}
const post = { action: "answer", text: "Founders with no paying customers", revision: 0, requestId: "one", locale: "en" };
const patch = { action: "save", draft, revision: 1, profileVersion: 0, requestId: "save", locale: "en" };

test("ICP end-to-end draft/save/reload preserves company data; duplicate request bills once", async () => {
  const h = harness();
  await h.api.runIcp(user("a"), post);
  assert.equal(h.reservations(), 1);
  assert.deepEqual(h.completions, [true]);
  await h.api.runIcp(user("a"), post);
  assert.equal(h.reservations(), 1);
  assert.equal(h.profiles.get("a")!.icp, "Old ICP");
  await h.api.patchIcp("a", patch);
  await h.api.patchIcp("a", patch);
  const restored = await h.api.getIcpWorkspace("a", "en");
  assert.equal(restored.saved?.who, "Founders");
  assert.equal(restored.profileVersion, 1);
  assert.equal(h.profiles.get("a")!.icpVersion, 1);
  assert.equal(h.profiles.get("a")!.companyName, "Keep me");
  assert.deepEqual(h.profiles.get("a")!.needs, ["legal"]);
  assert.equal((await h.api.getIcpWorkspace("b", "en")).draft, null);
});

test("AI failure and quota failure preserve answer and saved ICP, allow retry without duplicate answer", async () => {
  const h = harness(); h.generate(async () => { throw new Error("timeout with provider key SECRET"); });
  await assert.rejects(h.api.runIcp(user("a"), post), (error: unknown) => error instanceof Error && !error.message.includes("SECRET") && /timed out/.test(error.message));
  assert.deepEqual(h.completions, [false]);
  assert.equal((await h.api.getIcpWorkspace("a", "en")).messages.filter(m => m.role === "user").length, 1);
  assert.equal(h.profiles.get("a")!.icp, "Old ICP");
  h.generate(async () => draft);
  await h.api.runIcp(user("a"), { ...post, action: "retry", revision: 1, requestId: "retry" });
  assert.equal((await h.api.getIcpWorkspace("a", "en")).messages.filter(m => m.role === "user").length, 1);
  const q = harness(); q.exhaust();
  await assert.rejects(q.api.runIcp(user("a"), post), (e: unknown) => (e as { status: number }).status === 429);
  assert.equal(q.completions.length, 0);
  assert.equal((await q.api.getIcpWorkspace("a", "en")).messages.filter(m => m.role === "user").length, 1);
});

test("Concurrent requests own one analysis lock; stale revisions cannot overwrite draft", async () => {
  const h = harness();
  let finish!: (value: IcpDraft) => void;
  h.generate(() => new Promise(resolve => { finish = resolve; }));
  const active = h.api.runIcp(user("a"), post);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(h.api.runIcp(user("a"), { ...post, requestId: "second" }), (e: unknown) => (e as { status: number }).status === 409);
  assert.equal(h.reservations(), 1); finish(draft); await active;
  await assert.rejects(h.api.patchIcp("a", { ...patch, revision: 0 }), (e: unknown) => (e as { status: number }).status === 409);
  assert.equal(h.profiles.get("a")!.icp, "Old ICP");
});

test("Profile version conflict rolls back workspace edits and preserves both versions", async () => {
  const h = harness(); await h.api.runIcp(user("a"), post);
  h.profiles.get("a")!.icpVersion = 2;
  h.profiles.get("a")!.icp = "Newer saved hypothesis";
  await assert.rejects(h.api.patchIcp("a", patch), (e: unknown) => (e as { status: number }).status === 409);
  assert.equal(h.workspaces.get("a")!.revision, 1);
  assert.equal(h.profiles.get("a")!.icp, "Newer saved hypothesis");
});

test("Expired request with reused ID cannot let a late AI result overwrite the newer draft", async () => {
  const h = harness();
  let finish!: (value: IcpDraft) => void;
  h.generate(() => new Promise(resolve => { finish = resolve; }));
  const old = h.api.runIcp(user("a"), post);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  h.workspaces.get("a")!.pendingSince = new Date(Date.now() - 121000);
  const newer = { ...draft, summary: "Newer draft" };
  h.generate(async () => newer);
  await h.api.runIcp(user("a"), { ...post, action: "retry", revision: 1 });
  finish({ ...draft, summary: "Late stale result" });
  await assert.rejects(old, (e: unknown) => (e as { status: number }).status === 409);
  assert.equal((await h.api.getIcpWorkspace("a", "en")).draft?.summary, "Newer draft");
});


test("Saved ICP is mapped into Next steps context as a hypothesis, with company/customer stages distinct", async () => {
  const mapper = load<{ getCurrentAccount(): Promise<Account> }>("src/lib/auth/account.ts", {
    react: { cache: (fn: unknown) => fn },
    "@/lib/icp/schema": schema,
    "@/lib/auth/guard": { getUserSession: async () => ({ uid: "a" }) },
    "@/lib/prisma": { prisma: {
      setting: { findUnique: async () => null },
      user: { findUnique: async ({ where }: { where: { id: string } }) => {
        assert.equal(where.id, "a");
        return { id: "a", plan: "enterprise", createdAt: new Date(), profile: { ...user("a").profile, companyStage: "Growth", icpVersion: 1, icpDetails: { ...draft, stage: "MVP, no paid users" }, needs: [], targetMarkets: [] } };
      } },
    } },
  });
  const account = await mapper.getCurrentAccount();
  assert.equal(account.profile?.icpDetails?.stage, "MVP, no paid users");
  let context = "";
  class Client {
    messages = { create: async (input: { messages: Array<{ content: string }> }) => { context = input.messages[0].content; throw new Error("captured before provider call"); } };
  }
  const engine = load<{ diagnoseActionPlan(input: object): Promise<unknown> }>("src/lib/action-plan/ai.ts", {
    "@anthropic-ai/sdk": { default: Client },
    "./constants": require("../src/lib/action-plan/constants"),
    "./schemas": require("../src/lib/action-plan/schemas"),
  });
  await assert.rejects(engine.diagnoseActionPlan({ locale: "en", profile: account.profile, quiz: null, messages: [], answers: [] }), /captured/);
  const known = JSON.parse(context.split("Known context:\n")[1]);
  assert.equal(known.profile.companyStage, "Growth");
  assert.equal(known.profile.icpDetails.stage, "MVP, no paid users");
  assert.match(known.icpStatus, /not market-validated/);
});
