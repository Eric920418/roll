import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { activeOrderStatuses } from "../src/lib/prospecting/schema";
import * as policy from "../src/lib/prospecting/schema";

const native = createRequire(import.meta.url);
function fixture() {
  let now = Date.now(), expires = 0, cached: string | null | undefined;
  const state = { order: null as Date | null, hold: null as Date | null, reads: 0, runs: 0, invalidations: 0, failRead: false, failRun: false };
  class Clock extends Date { static now() { return now; } }
  const cache = {
    unstable_cache: (fn: () => Promise<string | null>, keys: string[], options: { tags: string[]; revalidate: number }) => {
      assert.deepEqual([...keys], [...options.tags]); assert.equal(options.revalidate, 3600);
      return async () => { if (cached === undefined || now >= expires) { cached = await fn(); expires = now + 3600000; } return cached; };
    },
    revalidateTag: (tag: string, profile: { expire: number }) => { assert.equal(tag, "prospecting-next-work"); assert.equal(profile.expire, 0); state.invalidations++; cached = undefined; },
  };
  const mocks: Record<string, unknown> = {
    "next/cache": cache,
    "./schema": { activeOrderStatuses },
    "@/lib/prisma": { prisma: {
      prospectingOrder: { aggregate: async (args: unknown) => { state.reads++; assert.deepEqual(JSON.parse(JSON.stringify(args)), { where: { status: { in: activeOrderStatuses } }, _min: { nextAttemptAt: true } }); if (state.failRead) throw new Error("Schedule database unavailable"); return { _min: { nextAttemptAt: state.order } }; } },
      tokenReservation: { aggregate: async (args: unknown) => { state.reads++; assert.deepEqual(JSON.parse(JSON.stringify(args)), { where: { status: "reserved" }, _min: { expiresAt: true } }); return { _min: { expiresAt: state.hold } }; } },
    } },
    "@/lib/prospecting/worker": { runProspecting: async () => { state.runs++; if (state.failRun) throw new Error("Worker unavailable"); state.order = null; state.hold = null; return { enabled: true, processed: 1 }; } },
    "@/lib/prospecting/client": { configured: () => true },
    "@/lib/prospecting/http": { prospectingFailure: (error: Error) => Response.json({ error: error.message }, { status: 500 }) },
  };
  function load<T>(file: string): T {
    const mod = { exports: {} };
    runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: mod, exports: mod.exports, Date: Clock, console: { info() {} }, Buffer, Request, Response, process: { env: { CRON_SECRET: "qa-only" } },
      require: (id: string) => id in mocks ? mocks[id] : native(id),
    });
    return mod.exports as T;
  }
  const schedule = load<typeof import("../src/lib/prospecting/schedule")>("src/lib/prospecting/schedule.ts");
  mocks["@/lib/prospecting/schedule"] = schedule;
  const route = load<typeof import("../src/app/api/cron/prospecting/route")>("src/app/api/cron/prospecting/route.ts");
  const tick = (authorized = true) => route.GET(new Request("https://example.test/api/cron/prospecting", { headers: authorized ? { authorization: "Bearer qa-only" } : {} }));
  return { state, schedule, tick, advance: (ms: number) => { now += ms; }, now };
}

test("empty minute cron reuses schedule without worker, expiry sweep or database reads; auth still runs first", async () => {
  const h = fixture();
  assert.equal((await h.tick(false)).status, 401); assert.equal(h.state.reads, 0);
  for (let n = 0; n < 30; n++) { assert.equal((await (await h.tick()).json()).data.idle, true); h.advance(60000); }
  assert.equal(h.state.reads, 2); assert.equal(h.state.runs, 0);
  h.advance(3600000); await h.tick(); assert.equal(h.state.reads, 4);
});

test("new committed search invalidation wakes the next minute and completed runs restore idle cache", async () => {
  const h = fixture(); await h.tick();
  h.state.order = new Date(h.now); h.schedule.invalidateProspectingSchedule();
  assert.equal((await (await h.tick()).json()).data.processed, 1);
  await h.tick(); await h.tick();
  assert.equal(h.state.runs, 1); assert.equal(h.state.reads, 6);
});

test("retry timestamps and Token expiry still run on their due minute, including invitation holds", async () => {
  const h = fixture(); h.state.order = new Date(h.now + 120000); h.state.hold = new Date(h.now + 60000);
  assert.equal((await (await h.tick()).json()).data.idle, true);
  h.advance(60000); assert.equal((await (await h.tick()).json()).data.processed, 1);
  assert.equal(h.state.reads, 2); assert.equal(h.state.runs, 1);
  h.state.order = new Date(h.now + 180000); h.schedule.invalidateProspectingSchedule(); await h.tick();
  h.advance(120000); await h.tick(); assert.equal(h.state.runs, 2);
});

test("schedule errors are never saved as idle; failed runs invalidate and retry without changing worker behavior", async () => {
  const h = fixture(); h.state.failRead = true;
  assert.equal((await h.tick()).status, 500); h.state.failRead = false; h.state.order = new Date(h.now);
  h.state.failRun = true; assert.equal((await h.tick()).status, 500); assert.equal(h.state.invalidations, 1);
  h.state.failRun = false; assert.equal((await h.tick()).status, 200); assert.equal(h.state.runs, 2);
});

test("order receipts invalidate only after transaction commit; rollback leaves the schedule alone", async () => {
  const events: string[] = [];
  let rollback = false;
  const input = { requestId: "existing-receipt", revision: 0, country: "TW", description: "Buyer operations", count: 5 as const };
  const payloadHash = native("node:crypto").createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/billing/commerce": {}, "@/lib/tokens/service": {}, "@/lib/tokens/expiry": {},
    "@/lib/network/access": {}, "@/lib/discovery/policy": {}, "@/lib/icp/schema": {}, "./client": {}, "./backup": {}, "./schema": policy,
    "@/lib/prospecting/schedule": { invalidateProspectingSchedule: () => events.push("invalidate") },
    "@/lib/prisma": { prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      events.push("start");
      if (rollback) throw new Error("Transaction rolled back");
      const saved = await fn({ $queryRaw: async () => [{ id: "member" }], prospectingOrder: { findUnique: async () => ({ id: "receipt", payloadHash, status: "pending" }) } });
      events.push("commit"); return saved;
    } } },
  };
  const mod = { exports: {} };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/prospecting/service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: mod, exports: mod.exports, require: (id: string) => id in mocks ? mocks[id] : native(id),
  });
  const service = mod.exports as typeof import("../src/lib/prospecting/service");
  assert.equal((await service.createProspectOrder("member", input)).id, "receipt");
  assert.deepEqual(events, ["start", "commit", "invalidate"]);
  events.length = 0; rollback = true;
  await assert.rejects(service.createProspectOrder("member", input), /rolled back/);
  assert.deepEqual(events, ["start"]);
});
