import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as api from "../src/lib/api";
import type { PaypalOrder } from "../src/lib/billing/paypal";

function load<T>(file: string, mocks: Record<string, unknown>): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: loaded, exports: loaded.exports, process, console, Date, Error, Buffer, URL, Request, Response, crypto: { randomUUID }, require: (id: string) => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}
const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Security boundaries against isolated PostgreSQL: ownership, revocation, concurrent payments and limits", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const ids: string[] = []; const prefix = `security-${randomUUID()}`;
  const user = async () => { const row = await db.user.create({ data: { email: `${randomUUID()}@example.invalid` } }); ids.push(row.id); return row; };
  const owner = await user(), other = await user(); let identity = other;
  class WriteError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const mocks = { "@/lib/action-plan/service": { PlanWriteError: WriteError }, "@/lib/customer-insights/service": { lockInterviewAction: async () => { throw new Error("Foreign records must never reach the interview lock"); }, refreshInterviewProgress: async () => { throw new Error("Foreign records must never change interview totals"); } }, "@/lib/api": api, "@/lib/prisma": { prisma: db }, "@/lib/auth/guard": { getUserSession: async () => ({ uid: identity.id, email: identity.email, sessionVersion: identity.sessionVersion }) }, "@/lib/billing/gate": { requirePlan: async () => ({}), getEffectivePlan: () => "business" }, "@/lib/auth/account": { getCurrentAccount: async () => ({ id: identity.id }), getBetaAccess: async () => false } };
  const req = (method: string, body?: object, pathname = "/api/test") => new NextRequest(`https://example.test${pathname}`, { method, headers: { Origin: "https://example.test", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    await t.test("Foreign note and CRM IDs cannot be changed or deleted", async () => {
      const note = await db.meetingNote.create({ data: { userId: owner.id, title: "Private note" } });
      const contact = await db.contact.create({ data: { userId: owner.id, name: "Private contact" } });
      const notes = load<typeof import("../src/app/api/notes/[id]/route")>("src/app/api/notes/[id]/route.ts", mocks);
      const crm = load<typeof import("../src/app/api/crm/[id]/route")>("src/app/api/crm/[id]/route.ts", mocks);
      for (const [route, id, body] of [[notes, note.id, { title: "Changed" }], [crm, contact.id, { name: "Changed" }]] as const) {
        const context = { params: Promise.resolve({ id }) };
        assert.equal((await route.PATCH(req("PATCH", body), context)).status, 404);
        assert.equal((await route.DELETE(req("DELETE"), context)).status, 404);
      }
      assert.equal((await db.meetingNote.findUniqueOrThrow({ where: { id: note.id } })).title, "Private note");
      assert.equal((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).name, "Private contact");
    });
    await t.test("Invitations and PDFs require matching recipient, accepted access and sharing; revocation blocks reads", async () => {
      const token = "a".repeat(43);
      const portal = await db.investorPortal.create({ data: { userId: owner.id, businessPlanPath: `investor-business-plans/${prefix}/synthetic.pdf`, shareBusinessPlan: false } });
      const invite = await db.investorInvitation.create({ data: { portalId: portal.id, invitedEmail: other.email, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60000) } });
      const portalMock = { ownerHasInvestorAccess: () => true };
      const accept = load<typeof import("../src/app/api/investor/invitations/accept/route")>("src/app/api/investor/invitations/accept/route.ts", { ...mocks, "@/lib/investor/portal": portalMock });
      identity = owner; assert.equal((await accept.POST(req("POST", { token }))).status, 403);
      identity = other; const accepted = await Promise.all([accept.POST(req("POST", { token })), accept.POST(req("POST", { token }))]);
      assert.equal(accepted.filter(r => r.status === 200).length, 1);
      assert.equal(accepted.filter(r => [404, 409].includes(r.status)).length, 1);
      let reads = 0;
      const pdf = load<typeof import("../src/app/api/investor-portal/business-plan/route")>("src/app/api/investor-portal/business-plan/route.ts", { ...mocks, "@/lib/investor/portal": portalMock, "@vercel/blob": { get: async () => { reads++; return { statusCode: 200, stream: new Response("%PDF-fixture").body }; } } });
      const get = () => pdf.GET(req("GET", undefined, `/api/investor-portal/business-plan?portalId=${portal.id}`));
      assert.equal((await get()).status, 404); assert.equal(reads, 0);
      await db.investorPortal.update({ where: { id: portal.id }, data: { shareBusinessPlan: true } });
      const oldToken = process.env.INVESTOR_BLOB_READ_WRITE_TOKEN; process.env.INVESTOR_BLOB_READ_WRITE_TOKEN = "local-fixture-private-token";
      try { const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); } finally { if (oldToken === undefined) delete process.env.INVESTOR_BLOB_READ_WRITE_TOKEN; else process.env.INVESTOR_BLOB_READ_WRITE_TOKEN = oldToken; }
      const revoke = load<typeof import("../src/app/api/investor-portal/invitations/[id]/route")>("src/app/api/investor-portal/invitations/[id]/route.ts", mocks);
      assert.equal((await revoke.DELETE(req("DELETE"), { params: Promise.resolve({ id: invite.id }) })).status, 404);
      identity = owner; assert.equal((await revoke.DELETE(req("DELETE"), { params: Promise.resolve({ id: invite.id }) })).status, 200);
      identity = other; assert.equal((await get()).status, 404); assert.equal(reads, 1);
    });
    await t.test("Concurrent PayPal completion credits once; amount and owner mismatch never credit", async () => {
      const purchase = await db.aiCreditPurchase.create({ data: { userId: owner.id, paypalOrderId: prefix, requestId: randomUUID() } });
      const credits = load<typeof import("../src/lib/billing/credits")>("src/lib/billing/credits.ts", { "@/lib/prisma": { prisma: db } });
      const order: PaypalOrder = { id: purchase.paypalOrderId, status: "COMPLETED", purchase_units: [{ custom_id: owner.id, payments: { captures: [{ id: `${prefix}-capture`, status: "COMPLETED", amount: { currency_code: "USD", value: "5.00" } }] } }] };
      const wrongAmount = structuredClone(order); wrongAmount.purchase_units![0].payments!.captures![0].amount!.value = "0.01";
      const wrongOwner = structuredClone(order); wrongOwner.purchase_units![0].custom_id = other.id;
      await assert.rejects(credits.fulfillCreditOrder(wrongAmount), /金額/); await assert.rejects(credits.fulfillCreditOrder(wrongOwner), /帳號/);
      const result = await Promise.all([credits.fulfillCreditOrder(order), credits.fulfillCreditOrder(order)]);
      assert.equal(result.filter(r => r.added).length, 1); assert.equal((await db.aiAllowance.findUniqueOrThrow({ where: { userId: owner.id } })).bonusBalance, 10);
      assert.equal((await credits.fulfillCreditOrder(order)).added, false);
    });
    await t.test("Atomic rate limits permit exactly ten of twenty concurrent requests", async () => {
      const limits = load<typeof import("../src/lib/rate-limit")>("src/lib/rate-limit.ts", { "@/lib/prisma": { prisma: db }, "./security/http": requireFromRoot("../src/lib/security/http"), "./security/log": requireFromRoot("../src/lib/security/log") });
      const results = await Promise.all(Array.from({ length: 20 }, () => limits.checkRateLimit(prefix, 10, 60000)));
      assert.equal(results.filter(r => r.ok).length, 10);
    });
    await t.test("Password compare-and-swap in PostgreSQL preserves the winning hash and increments once", async () => {
      const changed = await Promise.all(["first-hash", "second-hash"].map(passwordHash => db.user.updateMany({ where: { id: owner.id, sessionVersion: 0, passwordHash: null }, data: { passwordHash, sessionVersion: { increment: 1 } } })));
      assert.equal(changed.reduce((n, r) => n + r.count, 0), 1); assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).sessionVersion, 1);
    });
  } finally { await db.rateCounter.deleteMany({ where: { key: prefix } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});
const requireFromRoot = createRequire(import.meta.url);
