import * as securityHttp from "../src/lib/security/http";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as plans from "../src/lib/billing/plans";
import type { BillingAccount } from "../src/lib/billing/gate";
import type { Account } from "../src/lib/auth/account";
import * as discoveryPolicy from "../src/lib/discovery/policy";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
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

test("admin lists stored plan, effective access and grant sources without exposing billing credentials", async () => {
  let betaAccess = true;
  let authorized = true;
  let reads = 0;
  let rows: Array<{ plan: string; effectivePlan: string; accessLabel: string }> = [];
  const start = new Date(Date.now() - 86400000), end = new Date(Date.now() + 86400000);
  const cases = [
    { ...account, id: "basic" },
    { ...account, id: "legacy-trial", trialPlan: "pro", trialStartsAt: start, trialEndsAt: end },
    { ...account, id: "discovery", trialPolicy: discoveryPolicy.DISCOVERY_POLICY, trialPlan: "pro", trialStartsAt: start, trialEndsAt: end },
    { ...account, id: "founder", trialPolicy: discoveryPolicy.DISCOVERY_POLICY, founderStartedAt: start, founderEndsAt: end },
    { ...account, id: "pending", trialPolicy: discoveryPolicy.DISCOVERY_POLICY, plan: "pro", subscriptionStatus: "APPROVAL_PENDING", paypalSubscriptionId: "I-private" },
    { ...account, id: "paid", plan: "business", subscriptionStatus: "ACTIVE", paypalSubscriptionId: "I-paid", currentPeriodEnd: end },
    { ...account, id: "expired", trialPolicy: discoveryPolicy.DISCOVERY_POLICY, trialPlan: "pro", trialStartsAt: new Date(0), trialEndsAt: start },
    { ...account, id: "manual", plan: "enterprise" },
    { ...account, id: "rollon", rollonMember: true, plan: "pro" },
  ].map(value => ({ ...value, email: `${value.id}@example.invalid`, firstName: value.id, lastName: null, googleId: null, emailVerified: start, completed: true, onboardingStep: 4, quizCompleted: true, createdAt: start, passwordHash: "never-send-this" }));
  const jsx = (type: unknown, props: { users?: typeof rows }) => {
    if (props.users) rows = props.users;
    return { type, props };
  };
  const page = load<{ default: () => Promise<unknown> }>("src/app/admin/(dashboard)/users/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/auth/guard": { requireAdminPage: async () => { if (!authorized) throw new Error("Unauthorized"); } },
    "@/lib/auth/account": { getBetaAccess: async () => betaAccess },
    "@/lib/billing/gate": gate, "@/lib/billing/plans": plans,
    "@/lib/discovery/policy": discoveryPolicy,
    "@/components/admin/UsersList": { default: () => null },
    "@/lib/prisma": { prisma: { user: { findMany: async ({ select }: { select: Record<string, boolean> }) => {
      reads++;
      assert.equal(select.passwordHash, undefined);
      return cases.map(value => Object.fromEntries(Object.entries(value).filter(([key]) => select[key])));
    } } } },
  });
  await page.default();
  assert.equal(rows[0].plan, "free");
  assert.equal(rows[0].effectivePlan, "enterprise");
  assert.match(rows[0].accessLabel, /免費測試授權/);
  assert.equal(rows[2].effectivePlan, "free");
  assert.match(rows[2].accessLabel, /3 次訪談試用/);
  assert.equal(rows[3].effectivePlan, "pro");
  assert.match(rows[3].accessLabel, /創始會員/);
  assert.equal(rows[4].effectivePlan, "free");
  assert.equal(rows[6].effectivePlan, "free");
  assert.match(rows[6].accessLabel, /到期/);
  assert.match(rows[7].accessLabel, /管理員 Enterprise 授權/);
  assert.equal(rows[8].effectivePlan, "pro");
  assert.equal(rows[8].accessLabel, "rollon會員（永久 Pro，無需付費）");
  assert(!JSON.stringify(rows).includes("I-private"));
  assert(!JSON.stringify(rows).includes("never-send-this"));
  const list = load<{ default: ComponentType<{ users: typeof rows }> }>("src/components/admin/UsersList.tsx", {
    "react/jsx-runtime": jsxRuntime,
    react: { useMemo: (fn: () => unknown) => fn(), useState: (initial: unknown) => [initial, () => {}] },
    "next/navigation": { useRouter: () => ({ refresh: () => {} }) },
  });
  const html = renderToStaticMarkup(createElement(list.default, { users: rows }));
  for (const label of ["帳戶方案（原始）", "目前功能權限／授權來源", "Enterprise 功能", "免費測試授權（非付費訂閱）", "PayPal 待付款人核准"]) assert(html.includes(label), label);
  assert(!html.includes("I-private"));
  betaAccess = false;
  await page.default();
  assert.equal(rows[0].effectivePlan, "free");
  assert.equal(rows[1].effectivePlan, "pro");
  assert.match(rows[1].accessLabel, /Pro 限時試用/);
  assert.equal(rows[5].effectivePlan, "business");
  assert.match(rows[5].accessLabel, /PayPal 訂閱/);
  authorized = false;
  const before = reads;
  await assert.rejects(page.default(), /Unauthorized/);
  assert.equal(reads, before);
});

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

test("beta and rollon Pro checkout are rejected before calling PayPal or writing a subscription", async () => {
  let current = { ...account, betaAccess: true };
  const route = load<{ POST: (request: unknown) => Promise<{ status: number; json: () => Promise<{ code: string }> }> }>("src/app/api/billing/subscribe/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init: { status: number }) => ({ status: init.status, json: async () => body }) } },
    "@/lib/prisma": { prisma: {} },
    "@/lib/auth/guard": { getUserSession: async () => ({ uid: "existing" }) },
    "@/lib/auth/account": { getCurrentAccount: async () => current },
    "@/lib/api": {}, "@/lib/billing/plans": plans,
    "@/lib/billing/paypal": {}, "@/lib/billing/config": {}, "@/lib/routes": {},
  });
  const response = await route.POST({ url: "https://example.test/api/test", headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), json: () => { throw new Error("Checkout must stop before parsing"); } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "betaAccess");
  current = { ...account, betaAccess: true, rollonMember: true };
  const member = await route.POST({ url: "https://example.test/api/test", headers: new Headers({ Origin: "https://example.test", "Content-Type": "application/json" }), json: async () => ({ plan: "pro" }) });
  assert.equal(member.status, 409);
  assert.equal((await member.json()).code, "rollonMember");
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
    "@/lib/prisma": { prisma: { trialFeedbackGrant: { findUnique: async () => null }, $transaction: async (work: (value: unknown) => unknown) => work(tx) } },
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
  const member = { ...trial, rollonMember: true, trialPlan: null, trialStartsAt: null, trialEndsAt: null };
  const rollon = await allowance.getAiUsageSummary(member);
  assert.equal(rollon?.included, 150);
  assert.equal(anchors[2], member.createdAt);
});

test("investor sharing respects beta owner access and still requires an accepted invitation", async () => {
  let enabled = true;
  let invited = true;
  let owner: BillingAccount = account;
  const portal = load<typeof import("../src/lib/investor/portal")>("src/lib/investor/portal.ts", {
    "@/lib/network/policy": { networkEnabled: () => false },
    "@/lib/prisma": { prisma: { investorInvitation: { findMany: async (args: {
      where: { acceptedByUserId: string; status: string };
      include: { portal: { include: { user: { select: Record<string, unknown> } } } };
    }) => {
      assert.equal(args.where.acceptedByUserId, "investor");
      assert.equal(args.where.status, "accepted");
      assert.equal(args.include.portal.include.user.select.trialPolicy, true);
      assert.equal(args.include.portal.include.user.select.rollonMember, true);
      return invited ? [{ portalId: "portal", acceptedAt: now, portal: { user: owner } }] : [];
    } } } },
    "@/lib/billing/gate": gate,
    "@/lib/auth/account": { getBetaAccess: async () => enabled },
    "@/lib/billing/plans": plans,
    "@/lib/action-plan/service": {}, "@/lib/action-plan/dashboard": {}, "@/lib/investor/fields": {},
  });
  assert.equal(portal.ownerHasInvestorAccess(account, true), true);
  assert.equal(portal.ownerHasInvestorAccess(account, false), false);
  assert.equal(portal.ownerHasInvestorAccess({ ...account, rollonMember: true }, true), false);
  assert.equal((await portal.listInvestorMemberships("investor")).length, 1);
  owner = { ...account, trialPolicy: "interviews-3-v1", trialPlan: "enterprise", trialStartsAt: new Date(Date.now() - 86400000), trialEndsAt: new Date(Date.now() + 86400000) };
  assert.equal((await portal.listInvestorMemberships("investor")).length, 1);
  owner = { ...owner, trialEndsAt: new Date(0) };
  assert.equal((await portal.listInvestorMemberships("investor")).length, 0);
  owner = account;
  enabled = false;
  assert.equal((await portal.listInvestorMemberships("investor")).length, 0);
  enabled = true;
  invited = false;
  assert.equal((await portal.listInvestorMemberships("investor")).length, 0);
});
