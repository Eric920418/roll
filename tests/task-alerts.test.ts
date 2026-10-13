import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as schema from "../src/lib/week-plan/schema";
import { toPlanKey } from "../src/lib/billing/plans";
function load<T>(file: string, mocks: Record<string, unknown>, globals: object = {}): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: loaded, exports: loaded.exports, console, process, Buffer, Date, URL, Error, Response, AbortSignal, setTimeout, require: (id: string) => id in mocks ? mocks[id] : require(id), ...globals });
  return loaded.exports as T;
}
const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Task email alerts are atomic, private, opt-in, leased and idempotent in isolated PostgreSQL", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!); assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const owner = await db.user.create({ data: { email: `${randomUUID()}@task-alert.invalid` } }), other = await db.user.create({ data: { email: `${randomUUID()}@task-alert.invalid` } });
  const { getEffectivePlan } = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts", { "server-only": {}, "@/lib/auth/account": { getCurrentAccount: async () => null }, "@/lib/billing/plans": await import("../src/lib/billing/plans") });
  const previous = Object.fromEntries(["AUTH_SECRET", "NEXT_PUBLIC_APP_URL", "RESEND_API_KEY", "RESEND_FROM_EMAIL"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { AUTH_SECRET: "qa-task-signature", NEXT_PUBLIC_APP_URL: "https://example.invalid", RESEND_API_KEY: "re_qa_task_secret", RESEND_FROM_EMAIL: "NOVA <qa@example.invalid>" });
  class RewardError extends Error { constructor(message: string, public status = 409) { super(message); } }
  let configured = true, failSend = false, calls = 0, onWait: (() => Promise<void>) | null = null;
  const payloads: string[] = [], keys: string[] = [];
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const mocks = { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/rewards/service": { RewardError }, "@/lib/rewards/reminders": { rewardEmailConfigured: () => configured, canonicalEmailPayload: canonical, safeEmailError: (e: Error) => e.message.replaceAll("re_qa_task_secret", "[redacted]") }, "@/lib/auth/account": { getBetaAccess: async () => false }, "@/lib/billing/gate": { getEffectivePlan }, "@/lib/billing/plans": { toPlanKey }, "@/lib/action-plan/service": { getActiveActionPlan: async () => null, serializePlan: () => ({ actions: [] }) }, "@/lib/action-plan/workspace": { workspaceKind: () => null, workspaceLeads: () => [], interviewTarget: () => null }, "@/lib/customer-insights/interviews": { companyKey: (s: string) => s, interviewSummary: () => ({ total: 0 }) }, "@/lib/security/log": { logSecurityError: () => {} }, "./schema": schema };
  const calendar = load<typeof import("../src/lib/week-plan/service")>("src/lib/week-plan/service.ts", mocks);
  const alerts = load<typeof import("../src/lib/week-plan/alerts")>("src/lib/week-plan/alerts.ts", mocks, {
    fetch: async (_url: string, options: RequestInit) => { calls++; payloads.push(String(options.body)); keys.push((options.headers as Record<string, string>)["Idempotency-Key"]); return failSend ? Response.json({ message: "temporary re_qa_task_secret error" }, { status: 503 }) : Response.json({ id: `qa-${calls}` }); },
    setTimeout: (callback: () => void, ms: number) => { if (ms === 550) { const work = onWait; onWait = null; if (work) void work().then(callback); else callback(); return 0; } return setTimeout(callback, ms); },
  });
  const start = new Date(Date.now() + 3 * 3600000), day = new Date(start.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const input = () => schema.weekMutationSchema.parse({ operation: "add", requestId: randomUUID(), date: day, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 30 * 60000).toISOString(), durationMinutes: 30, title: "Private customer name", note: "Sensitive interview note", alertEmail: true, locale: "en" });
  const create = async () => { const id = await calendar.mutateWeekPlan(owner.id, false, input()); return db.weekCalendarItem.findUniqueOrThrow({ where: { id } }); };
  try {
    await t.test("Unconfigured or too-late opt-in rolls back; reminders and rows commit once together", async () => {
      configured = false; await assert.rejects(calendar.mutateWeekPlan(owner.id, false, input()), /unavailable/); assert.equal(await db.weekCalendarItem.count({ where: { userId: owner.id } }), 0); configured = true;
      const soon = new Date(Date.now() + 10 * 60000), date = new Date(soon.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      await assert.rejects(calendar.mutateWeekPlan(owner.id, false, { ...input(), date, startsAt: soon.toISOString(), endsAt: new Date(soon.getTime() + 30 * 60000).toISOString() } as schema.WeekMutation), /30 minutes/);
      const request = input(), ids = await Promise.all([calendar.mutateWeekPlan(owner.id, false, request), calendar.mutateWeekPlan(owner.id, false, request)]); assert.equal(ids[0], ids[1]);
      assert.equal(await db.calendarTaskAlert.count({ where: { userId: owner.id } }), 1);
      await calendar.mutateWeekPlan(owner.id, false, { operation: "remove", id: ids[0], revision: 0 });
    });
    await t.test("Outbox failure rolls back the calendar row; moving time keeps old delivery records and queues a new version", async () => {
      const broken = load<typeof import("../src/lib/week-plan/service")>("src/lib/week-plan/service.ts", { ...mocks, "@/lib/prisma": { prisma: { $transaction: (callback: (tx: unknown) => Promise<unknown>) => db.$transaction(tx => callback(new Proxy(tx, { get(target, property) { if (property === "calendarTaskAlert") return { ...target.calendarTaskAlert, createMany: async () => { throw new Error("Injected outbox failure"); } }; return Reflect.get(target, property); } }))) } } });
      const before = await db.weekCalendarItem.count({ where: { userId: owner.id } });
      await assert.rejects(broken.mutateWeekPlan(owner.id, false, input()), /Injected outbox/); assert.equal(await db.weekCalendarItem.count({ where: { userId: owner.id } }), before);
      const entry = await create(), shifted = new Date(start.getTime() + 86400000), date = new Date(shifted.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      await calendar.mutateWeekPlan(owner.id, false, { operation: "edit", id: entry.id, revision: 0, date, title: entry.title, note: entry.note, done: false });
      const changed = await db.weekCalendarItem.findUniqueOrThrow({ where: { id: entry.id } }); assert.notEqual(changed.alertVersion, entry.alertVersion); assert.equal(changed.startsAt?.toISOString(), shifted.toISOString());
      const jobs = await db.calendarTaskAlert.findMany({ where: { calendarItemId: entry.id } }); assert.equal(jobs.length, 2); assert.equal(jobs.find(job => job.version === entry.alertVersion)?.status, "cancelled");
      await calendar.mutateWeekPlan(owner.id, false, { operation: "remove", id: entry.id, revision: 1 }); assert((await db.calendarTaskAlert.findMany({ where: { calendarItemId: entry.id } })).every(job => job.status === "cancelled"));
    });
    await t.test("Concurrent cron runs send once; payload has no private task content; ordinary edits never send again", async () => {
      const entry = await create(), now = entry.alertAt!; const results = await Promise.all([alerts.runTaskAlerts(now), alerts.runTaskAlerts(now)]);
      assert.equal(results.reduce((n, r) => n + r.accepted, 0), 1); assert.equal(calls, 1);
      assert(!payloads[0].includes("Private customer name") && !payloads[0].includes("Sensitive interview note"));
      const record = await db.calendarTaskAlert.findFirstOrThrow({ where: { calendarItemId: entry.id } }); assert.equal(record.status, "accepted");
      await calendar.mutateWeekPlan(owner.id, false, { operation: "edit", id: entry.id, revision: 0, date: day, title: "Changed title", note: "", done: false });
      await alerts.runTaskAlerts(now); assert.equal(calls, 1); assert.equal(await db.calendarTaskAlert.count({ where: { calendarItemId: entry.id } }), 1);
      await assert.rejects(calendar.mutateWeekPlan(other.id, false, { operation: "edit", id: entry.id, revision: 1, date: day, title: "Stolen", note: "", done: false }), /not found/);
    });
    await t.test("Retry preserves payload bytes and provider idempotency; errors hide credentials", async () => {
      const entry = await create(); failSend = true; const index = calls; await alerts.runTaskAlerts(entry.alertAt!);
      let record = await db.calendarTaskAlert.findFirstOrThrow({ where: { calendarItemId: entry.id } }); assert.equal(record.attempts, 1); assert.equal(record.status, "pending"); assert(!record.lastError?.includes("re_qa_task_secret"));
      failSend = false; await alerts.runTaskAlerts(new Date(entry.alertAt!.getTime() + 15 * 60000));
      record = await db.calendarTaskAlert.findFirstOrThrow({ where: { calendarItemId: entry.id } }); assert.equal(record.status, "accepted"); assert.equal(payloads[index], payloads[index + 1]); assert.equal(keys[index], keys[index + 1]);
    });
    await t.test("Completed tasks, expired starts and lost Pro entitlement never send", async () => {
      const completed = await create(); await db.weekCalendarItem.update({ where: { id: completed.id }, data: { done: true } });
      const expired = await create(), free = await create(); await db.weekCalendarItem.update({ where: { id: free.id }, data: { kind: "action" } });
      const before = calls; await alerts.runTaskAlerts(start); assert.equal(calls, before);
      assert((await db.calendarTaskAlert.findMany({ where: { calendarItemId: { in: [completed.id, expired.id, free.id] } } })).every(row => row.status === "skipped"));
      const live = await create(); await db.weekCalendarItem.update({ where: { id: live.id }, data: { kind: "action" } }); await alerts.runTaskAlerts(live.alertAt!); assert.equal(calls, before);
    });
    await t.test("Three attempts or two-hour expiry stops sending, even before a future task starts", async () => {
      const capped = await create(), expired = await create();
      await db.calendarTaskAlert.updateMany({ where: { calendarItemId: capped.id }, data: { attempts: 3 } });
      await db.calendarTaskAlert.updateMany({ where: { calendarItemId: expired.id }, data: { scheduledAt: new Date(expired.alertAt!.getTime() - 3 * 3600000) } });
      const before = calls; await alerts.runTaskAlerts(capped.alertAt!); assert.equal(calls, before);
      assert((await db.calendarTaskAlert.findMany({ where: { calendarItemId: { in: [capped.id, expired.id] } } })).every(row => row.status === "expired"));
    });
    await t.test("Unsubscribe confirms by signed POST, cancels before send, and leaves daily preference alone", async () => {
      const entry = await create(), token = alerts.taskUnsubscribeToken(owner.id, entry.alertVersion!);
      assert.equal(alerts.readTaskUnsubscribeToken(token), owner.id); assert.throws(() => alerts.readTaskUnsubscribeToken(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")), /Invalid/);
      const dailyValue = `${owner.id}.${entry.alertVersion}`; assert.throws(() => alerts.readTaskUnsubscribeToken(`${dailyValue}.${createHmac("sha256", process.env.AUTH_SECRET!).update(`reward-unsubscribe:${dailyValue}`).digest("hex")}`), /Invalid/);
      await db.rewardReminder.create({ data: { userId: owner.id, enabled: true, time: "09:00", timeZone: "Asia/Taipei", locale: "en", tokenVersion: randomUUID() } });
      const before = calls; onWait = () => alerts.unsubscribeTaskAlerts(token); await alerts.runTaskAlerts(entry.alertAt!); assert.equal(calls, before);
      assert.equal((await db.rewardReminder.findUniqueOrThrow({ where: { userId: owner.id } })).enabled, true);
      assert.equal(await db.weekCalendarItem.count({ where: { userId: owner.id, alertAt: { not: null } } }), 0);
      assert.equal((await db.calendarTaskAlert.findFirstOrThrow({ where: { calendarItemId: entry.id } })).status, "cancelled");
    });
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } }); await db.$disconnect(); }
});
