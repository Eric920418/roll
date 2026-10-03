import * as securityHttp from "../src/lib/security/http";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as plans from "../src/lib/billing/plans";
import type { BillingAccount } from "../src/lib/billing/gate";
import type { Account } from "../src/lib/auth/account";

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports, process, Date,
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/lib/security/http") return securityHttp;
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

const gate = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts", {
  "@/lib/auth/account": {}, "@/lib/billing/plans": plans,
});
const now = new Date("2026-10-02T00:00:00Z");
const account: BillingAccount = {
  plan: "free", subscriptionStatus: null, paypalSubscriptionId: null,
  currentPeriodEnd: null, planUpdatedAt: null,
  trialPlan: null, trialStartsAt: null, trialEndsAt: null,
};

test("beta grants Enterprise to registered accounts; revoking preserves original entitlements", () => {
  assert.equal(gate.getEffectivePlan(null, now), "free");
  const originals: BillingAccount[] = [
    account,
    { ...account, plan: "business", subscriptionStatus: "ACTIVE", paypalSubscriptionId: "I-paid", currentPeriodEnd: new Date("2026-11-01") },
    { ...account, trialPlan: "pro", trialStartsAt: new Date("2026-10-01"), trialEndsAt: new Date("2026-10-10") },
    { ...account, plan: "enterprise" },
  ];
  for (const original of originals) {
    const before = JSON.stringify(original);
    const plan = gate.getEffectivePlan(original, now);
    assert.equal(gate.getEffectivePlan({ ...original, betaAccess: true }, now), "enterprise");
    assert.equal(gate.getEffectivePlan({ ...original, betaAccess: false }, now), plan);
    assert.equal(JSON.stringify(original), before);
  }
});

test("DAL reads the live switch for existing and newly registered users; only boolean true enables it", async () => {
  let user: unknown = { ...account, id: "existing", createdAt: new Date("2026-01-01") };
  let setting: unknown = null;
  const dal = load<typeof import("../src/lib/auth/account")>("src/lib/auth/account.ts", {
    react: { cache: (fn: unknown) => fn },
    "@/lib/icp/schema": {},
    "@/lib/prisma": { prisma: {
      user: { findUnique: async () => user },
      setting: { findUnique: async (args: { where: { key: string } }) => { assert.equal(args.where.key, "billing.betaAccess"); return setting; } },
    } },
    "@/lib/auth/guard": { getUserSession: async () => ({ uid: "existing" }) },
    "@/lib/billing/plans": plans,
  });
  for (const value of [null, { enabled: false }, { enabled: "true" }, { enabled: true }]) {
    setting = value === null ? null : { value };
    assert.equal((await dal.getCurrentAccount())?.betaAccess, value?.enabled === true);
  }
  user = { ...account, id: "new", createdAt: now };
  assert.equal(gate.getEffectivePlan(await dal.getCurrentAccount(), now), "enterprise");
  setting = { value: { enabled: false } };
  assert.equal(gate.getEffectivePlan(await dal.getCurrentAccount(), now), "free");
  user = null;
  assert.equal(await dal.getCurrentAccount(), null);
});

test("beta checkout is rejected before calling PayPal or writing a subscription", async () => {
  const route = load<{ POST: (request: unknown) => Promise<{ status: number; json: () => Promise<{ code: string }> }> }>("src/app/api/billing/subscribe/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init: { status: number }) => ({ status: init.status, json: async () => body }) } },
    "@/lib/prisma": { prisma: {} },
    "@/lib/auth/guard": { getUserSession: async () => ({ uid: "existing" }) },
    "@/lib/auth/account": { getCurrentAccount: async () => ({ ...account, betaAccess: true }) },
    "@/lib/api": {}, "@/lib/billing/plans": plans,
    "@/lib/billing/paypal": {}, "@/lib/billing/config": {}, "@/lib/routes": {},
  });
  const response = await route.POST({ url: "https://example.test/api/test", headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), json: () => { throw new Error("Checkout must stop before parsing"); } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "betaAccess");
});

test("enabling beta preserves a trial user's AI cycle and included allowance", async () => {
  const anchors: Date[] = [];
  const state = { includedUsed: 12, includedReserved: 0, bonusBalance: 7 };
  const tx = {
    aiAllowance: { upsert: async () => state, update: async () => state },
    aiUsage: { findMany: async () => [] },
  };
  const allowance = load<typeof import("../src/lib/ai/allowance")>("src/lib/ai/allowance.ts", {
    "@prisma/client": { Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } } },
    "@/lib/prisma": { prisma: { $transaction: async (work: (value: unknown) => unknown) => work(tx) } },
    "@/lib/billing/gate": gate,
    "./allowance-cycle": { monthlyCycle: (anchor: Date) => {
      anchors.push(anchor);
      return { start: anchor, end: new Date(anchor.getTime() + 30 * 86400000) };
    } },
  });
  const trialStartsAt = new Date(Date.now() - 2 * 86400000);
  const trial = {
    ...account, id: "trial", createdAt: new Date("2026-01-01"), trialPlan: "pro",
    trialStartsAt, trialEndsAt: new Date(Date.now() + 10 * 86400000),
  } as Account;
  const before = await allowance.getAiUsageSummary(trial);
  const during = await allowance.getAiUsageSummary({ ...trial, betaAccess: true });
  assert.equal(anchors[0], trialStartsAt);
  assert.equal(anchors[1], trialStartsAt);
  assert.equal(JSON.stringify(during), JSON.stringify(before));
  assert.equal(during?.included, 150);
});

test("investor sharing respects beta owner access and still requires an accepted invitation", async () => {
  let enabled = true;
  let invited = true;
  const portal = load<typeof import("../src/lib/investor/portal")>("src/lib/investor/portal.ts", {
    "@/lib/prisma": { prisma: { investorInvitation: { findMany: async (args: { where: { acceptedByUserId: string; status: string } }) => {
      assert.equal(args.where.acceptedByUserId, "investor");
      assert.equal(args.where.status, "accepted");
      return invited ? [{ portalId: "portal", acceptedAt: now, portal: { user: account } }] : [];
    } } } },
    "@/lib/billing/gate": gate,
    "@/lib/auth/account": { getBetaAccess: async () => enabled },
    "@/lib/billing/plans": plans,
    "@/lib/action-plan/service": {}, "@/lib/action-plan/dashboard": {}, "@/lib/investor/fields": {},
  });
  assert.equal(portal.ownerHasInvestorAccess(account, true), true);
  assert.equal(portal.ownerHasInvestorAccess(account, false), false);
  assert.equal((await portal.listInvestorMemberships("investor")).length, 1);
  enabled = false;
  assert.equal((await portal.listInvestorMemberships("investor")).length, 0);
  enabled = true;
  invited = false;
  assert.equal((await portal.listInvestorMemberships("investor")).length, 0);
});
