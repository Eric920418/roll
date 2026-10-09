import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as policy from "../src/lib/dashboard/next-steps";
import * as feedback from "../src/lib/dashboard/feedback";
import * as schemas from "../src/lib/dashboard/schemas";
import { Children, isValidElement, type ReactNode } from "react";

const answers = { goal: "Find customers", motivation: "Validate demand", firstStep: "Interview founders", continueUsing: "yes" as const, reason: "Plan next actions", usage: "Weekly review", painPoint: "No leads", indispensable: "Evidence-based decisions" };
test("Progress counts recorded steps, clamps invalid data, and needs confirmed tasks for 100%", () => {
  const tasks = [{ done: false, metric: { target: 20, current: 0 } }, { done: false }];
  assert.equal(policy.actionProgress([]), 0);
  assert.equal(policy.actionProgress(tasks), 0);
  tasks[0].metric!.current = 1; assert.equal(policy.actionProgress(tasks), 2.5);
  tasks[0].metric!.current = 20; assert.equal(policy.actionProgress(tasks), 49.5);
  tasks[0].done = true; assert.equal(policy.actionProgress(tasks), 50);
  tasks[1].done = true; assert.equal(policy.actionProgress(tasks), 100);
  assert.equal(policy.actionProgress([{ done: false, metric: { target: 0, current: 20 } }, { done: false, metric: { target: 20, current: -1 } }, { done: false, metric: { target: 20, current: NaN } }]), 0);
  assert.equal(policy.actionProgress([{ done: false, metric: { target: 2, current: 500 } }]), 99);
});
test("Trial countdown and seventh-day feedback include expired three-day trials, never regular members", () => {
  const starts = new Date("2026-10-01T01:00:00Z"), ends = new Date("2026-10-04T01:00:00Z");
  const user = { trialPlan: "pro", trialStartsAt: starts, trialEndsAt: ends };
  assert.equal(policy.trialWindow({ ...user, trialPlan: null }), null);
  assert.equal(policy.trialWindow({ ...user, trialEndsAt: starts }), null);
  assert.equal(policy.trialWindow(user, new Date("2026-09-30"))!.active, false);
  assert.equal(policy.trialWindow(user, starts)!.daysRemaining, 3);
  assert.equal(policy.trialWindow(user, ends)!.active, false);
  assert.equal(policy.trialWindow(user, new Date("2026-10-08T00:59:59Z"))!.due, false);
  assert.equal(policy.trialWindow(user, new Date("2026-10-08T01:00:00Z"))!.due, true);
});
test("Survey requires every question and Yes usage; No clears stale conditional usage", () => {
  assert(policy.trialAnswersSchema.safeParse(answers).success);
  for (const key of Object.keys(answers)) assert.equal(policy.trialAnswersSchema.safeParse({ ...answers, [key]: " " }).success, false, key);
  assert.equal(policy.trialAnswersSchema.parse({ ...answers, continueUsing: "no", usage: "" }).usage, "");
  assert.equal(policy.trialAnswersSchema.parse({ ...answers, continueUsing: "no", usage: "Hidden old Yes answer" }).usage, "");
  assert.equal(policy.trialAnswersSchema.safeParse({ ...answers, goal: "a".repeat(2001) }).success, false);
  assert(policy.trialDraftSchema.safeParse({ ...answers, goal: "", continueUsing: "" }).success);
});
test("Survey CSV keeps stable columns, quotes newlines and rejects spreadsheet formula injection", () => {
  const csv = policy.trialFeedbackCsv([{ email: "qa@example.invalid", createdAt: "2026-10-10", answers: { ...answers, goal: '  =HYPERLINK("bad")', painPoint: "Two\nlines" } }]);
  assert(csv.startsWith("email,submitted_at,goal,motivation,first_step,continue_using,reason,usage,pain_point,indispensable\r\n"));
  assert(csv.includes('"\'  =HYPERLINK(""bad"")"'));
  assert(csv.includes('"Two\nlines"'));
});

test("Admin 3/7-day shortcuts change the form only; explicit save keeps the chosen duration", () => {
  const state: unknown[] = []; let cursor = 0;
  const require = createRequire(import.meta.url), loaded = { exports: {} as { TrialControls(props: object): ReactNode } };
  const source = ts.transpileModule(readFileSync("src/components/admin/UsersList.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(`${source}\nmodule.exports.TrialControls = TrialControls;`, { module: loaded, exports: loaded.exports, Date, require: (id: string) => {
    if (id === "react") return { useState: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: unknown) => { state[i] = value; }]; } };
    return require(id);
  } });
  let saves = 0, saved: string[] = [];
  type Props = { children?: ReactNode; type?: string; value?: string; onClick?(): void };
  function render() { cursor = 0; const nodes: Array<{ type: unknown; props: Props }> = [];
    function visit(node: ReactNode) { Children.forEach(node, child => { if (isValidElement<Props>(child)) { nodes.push(child); visit(child.props.children); } }); }
    visit(loaded.exports.TrialControls({ user: { id: "qa", trialPlan: null, trialStartsAt: null, trialEndsAt: null }, disabled: false, onSave: (_user: unknown, _plan: unknown, start: string, end: string) => { saves++; saved = [start, end]; } })); return nodes;
  }
  for (const days of [3, 7]) {
    render().find(node => node.type === "button" && Array.isArray(node.props.children) && node.props.children[0] === days)!.props.onClick!();
    const values = render().filter(node => node.props.type === "datetime-local").map(node => node.props.value!);
    assert.equal(new Date(values[1]).getTime() - new Date(values[0]).getTime(), days * 86_400_000); assert.equal(saves, 0);
  }
  render().find(node => node.type === "button" && node.props.children === "設定")!.props.onClick!();
  assert.equal(saves, 1); assert.equal(new Date(saved[1]).getTime() - new Date(saved[0]).getTime(), 7 * 86_400_000);
});

test("Trial feedback API in isolated PostgreSQL: eligibility, ownership, concurrency and rollback", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) }), ids: string[] = [];
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  let uid: string | null = null, limited = false, blocked = false;
  const json = (data: unknown, status = 200) => Response.json({ data }, { status });
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const mocks: Record<string, unknown> = { "@/lib/prisma": { prisma: db }, "@/lib/dashboard/next-steps": policy, "@/lib/dashboard/feedback": feedback, "@/lib/dashboard/schemas": schemas,
    "@/lib/auth/guard": { getUserSession: async () => uid ? { uid } : null }, "@/lib/security/http": { browserMutationGuard: () => blocked ? fail("Blocked", 403) : null },
    "@/lib/rate-limit": { checkRateLimit: async () => ({ ok: !limited }) }, "@/lib/api": { ok: json, fail, unauthorized: () => fail("Login required", 401), failFromError: () => fail("Safe server error", 500) } };
  runInNewContext(ts.transpileModule(readFileSync("src/app/api/feedback/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: loaded, exports: loaded.exports, require: (id: string) => id in mocks ? mocks[id] : require(id), Date, Error });
  const api = loaded.exports as { GET(): Promise<Response>; POST(req: Request): Promise<Response> };
  const startsAt = new Date(Date.now() - 8 * 86_400_000);
  const post = (body: unknown) => api.POST(new Request("http://localhost/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const body = { action: "trialSurvey", startsAt: startsAt.toISOString(), locale: "en", answers };
  try {
    const a = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, trialPlan: "pro", trialStartsAt: startsAt, trialEndsAt: new Date(startsAt.getTime() + 3 * 86_400_000) } }); ids.push(a.id);
    const b = await db.user.create({ data: { email: `${randomUUID()}@example.invalid` } }); ids.push(b.id);
    await t.test("Authentication, same-origin and rate limit reject writes", async () => {
      assert.equal((await api.GET()).status, 401); assert.equal((await post(body)).status, 401);
      uid = a.id; blocked = true; assert.equal((await post(body)).status, 403); blocked = false;
      limited = true; assert.equal((await post(body)).status, 429); limited = false;
    });
    await t.test("No trial or incomplete answers cannot create a report", async () => {
      uid = b.id; assert.equal((await post(body)).status, 409); assert.equal((await (await api.GET()).json()).data.trial, null);
      uid = a.id; assert.equal((await post({ ...body, answers: { ...answers, goal: "" } })).status, 400);
      assert.equal((await post({ ...body, startsAt: new Date().toISOString() })).status, 409);
      assert.equal(await db.feedbackReport.count({ where: { userId: { in: ids } } }), 0);
    });
    await t.test("Expired trial can submit once; concurrent tabs never duplicate or replace answers", async () => {
      uid = a.id; assert.equal((await (await api.GET()).json()).data.trial.due, true);
      const results = await Promise.all([post(body), post(body), post(body)]);
      assert(results.every(result => result.status === 200));
      assert.equal(new Set(await Promise.all(results.map(async result => (await result.json()).data.id))).size, 1);
      await post({ ...body, answers: { ...answers, goal: "Attempted overwrite" } });
      const reports = await db.feedbackReport.findMany({ where: { userId: a.id } }); assert.equal(reports.length, 1);
      assert.equal((reports[0].surveyAnswers as { answers: policy.TrialAnswers }).answers.goal, answers.goal);
      assert.equal((await (await api.GET()).json()).data.submitted, true);
      uid = b.id; assert.equal((await (await api.GET()).json()).data.submitted, false);
    });
    await t.test("New trial settings reject stale submissions and enforce day seven", async () => {
      uid = b.id;
      const now = new Date(); await db.user.update({ where: { id: b.id }, data: { trialPlan: "pro", trialStartsAt: now, trialEndsAt: new Date(now.getTime() + 7 * 86_400_000) } });
      assert.equal((await post({ ...body, startsAt: now.toISOString() })).status, 409);
      assert.equal(await db.feedbackReport.count({ where: { userId: b.id } }), 0);
      // PostgreSQL aborts all writes on failure, including the unique trial-key insert.
      await assert.rejects(db.$transaction(async tx => { await tx.feedbackReport.create({ data: { userId: b.id, type: "other", title: "Rollback", body: "QA", trialKey: `rollback:${b.id}` } }); throw new Error("QA rollback"); }));
      assert.equal(await db.feedbackReport.count({ where: { userId: b.id } }), 0);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});
