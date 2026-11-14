import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pdfRuntime } from "./helpers/pdf-runtime";
import { memberRoles, memberRolesSchema, verifiedInvestor, verificationRoles } from "../src/lib/matchmaking/roles";
import { cardWriteSchema, overlapReasons } from "../src/lib/matchmaking/schema";

test("Roles validate selections, preserve legacy identities and never self-verify investors", () => {
  for (const value of [[], ["founder", "founder"], ["admin"], "mentor", null]) assert(!memberRolesSchema.safeParse(value).success);
  assert.deepEqual(memberRoles({ role: "mentor", roles: null }), ["mentor"]);
  assert.deepEqual(memberRoles({ role: "mentor", roles: ["founder"] }), ["mentor"], "Legacy primary-role update stays readable");
  assert.deepEqual(memberRoles({ role: "founder", roles: ["founder", "mentor"] }), ["founder", "mentor"]);
  assert(!verifiedInvestor({ role: "founder", roles: ["founder", "investor"], verified: false }));
  assert(verifiedInvestor({ role: "founder", roles: ["founder", "investor"], verified: true }));
  assert.equal(verificationRoles({ role: "investor" }), verificationRoles({ role: "mentor", roles: ["mentor", "investor"] }));
  assert.notEqual(verificationRoles({ role: "buyer" }), verificationRoles({ role: "buyer", roles: ["buyer", "investor"] }));
  assert(overlapReasons({ categories: ["mentorship"] }, { role: "founder", roles: ["founder", "mentor"] }).includes("need"));
  assert(!overlapReasons({ categories: ["investors"] }, { role: "founder", roles: ["founder", "investor"], verified: false }).includes("need"));
});

test("Role checkboxes support multiple choices, deselection, disabled state and both languages", () => {
  for (const locale of ["en", "zh-tw"]) {
    const load = pdfRuntime({ "next-intl": { useLocale: () => locale, useTranslations: () => (key: string) => key } });
    const { default: Roles } = load<typeof import("../src/components/auth/MemberRoles")>("src/components/auth/MemberRoles.tsx");
    let selected = ["founder", "mentor"] as Array<"founder" | "mentor">;
    const tree = Roles({ value: selected, onChange: v => { selected = v as typeof selected; } });
    const html = renderToStaticMarkup(tree);
    assert.equal((html.match(/type="checkbox"/g) || []).length, 5);
    assert.equal((html.match(/checked=""/g) || []).length, 2);
    assert.match(html, /min-h-11/); assert.match(html, locale === "en" ? /select all that apply/ : /可複選/);
    const inputs: React.ReactElement<{ value: string; onChange(e: { target: { checked: boolean } }): void }>[] = [];
    function walk(node: React.ReactNode) { React.Children.forEach(node, child => { if (React.isValidElement<{ children?: React.ReactNode }>(child)) { if (child.type === "input") inputs.push(child as typeof inputs[number]); walk(child.props.children); } }); }
    walk(tree); inputs.find(v => v.props.value === "founder")!.props.onChange({ target: { checked: false } });
    assert.deepEqual(Array.from(selected), ["mentor"]);
    assert.match(renderToStaticMarkup(Roles({ value: [], disabled: true, onChange() {} })), /fieldset disabled/);
  }
});

test("Signup and card identities persist in PostgreSQL, filter in both categories and keep verification and plan boundaries", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async () => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) }), ids: string[] = [];
  const env = { MEMBER_NETWORK_ENABLED: "true", BILLING_REQUIRE_EXPLICIT_ENTITLEMENT: "true", DISCOVERY_TRIAL_ENABLED: "true", GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test" };
  const googleEmail = `roles-google-${randomUUID()}@example.invalid`;
  let googleImage = "https://lh3.googleusercontent.com/a/first=s96-c";
  const load = pdfRuntime({
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/auth/account": { getBetaAccess: async () => false },
    "@/lib/auth/password": { hashPassword: async () => "qa-password-hash" },
    "@/lib/auth/session": { createUserSession: async () => "qa-session", USER_SESSION_COOKIE: "user_session", SESSION_MAX_AGE: 600 },
    "@/lib/auth/google": { buildAuthUrl: (s: string) => `https://accounts.google.com/auth?state=${s}`, localePrefixFromNext: () => "", exchangeCodeForProfile: async () => ({ sub: "roles-" + googleEmail, email: googleEmail, emailVerified: true, picture: googleImage }) },
    "@/lib/rate-limit": { MINUTE_MS: 60000, clientIp: () => "127.0.0.1", checkRateLimit: async () => ({ ok: true }) },
    "@/lib/security/log": { logSecurityError: () => "qa-reference", publicErrorMessage: () => "QA safe error" },
    "@/lib/action-plan/service": {}, "@/lib/evidence/service": {},
  }, { process: { env, cwd: () => process.cwd() }, crypto: { randomUUID } });
  const signup = load<typeof import("../src/app/api/auth/signup/route")>("src/app/api/auth/signup/route.ts");
  const authorize = load<typeof import("../src/app/api/auth/google/authorize/route")>("src/app/api/auth/google/authorize/route.ts");
  const callback = load<typeof import("../src/app/api/auth/google/callback/route")>("src/app/api/auth/google/callback/route.ts");
  const cards = load<typeof import("../src/lib/matchmaking/service")>("src/lib/matchmaking/service.ts");
  const access = load<typeof import("../src/lib/network/access")>("src/lib/network/access.ts");
  const registration = load<typeof import("../src/lib/referrals/registration")>("src/lib/referrals/registration.ts");
  const post = (path: string, body: unknown) => new NextRequest(`https://example.test${path}`, { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const email = `roles-email-${randomUUID()}@example.invalid`;
  try {
    for (const roles of [[], ["admin"], ["mentor", "mentor"]]) {
      assert.equal((await signup.POST(post("/api/auth/signup", { email, password: "qa-password", roles }))).status, 400);
      assert.equal((await authorize.POST(post("/api/auth/google/authorize", { roles }))).status, 400);
    }
    assert.equal(await db.user.findUnique({ where: { email } }), null);
    assert.equal((await signup.POST(post("/api/auth/signup", { email, password: "qa-password", roles: ["founder", "mentor"] }))).status, 201);
    const owner = await db.user.findUniqueOrThrow({ where: { email }, include: { matchmakingProfile: true } }); ids.push(owner.id);
    assert.deepEqual(owner.matchmakingProfile!.roles, ["founder", "mentor"]); assert.equal(owner.plan, "free");
    assert.equal(owner.matchmakingProfile!.verified, false); assert.equal(await db.mentorCertification.findUnique({ where: { userId: owner.id } }), null);
    const auth = await authorize.POST(post("/api/auth/google/authorize", { roles: ["mentor", "investor"], next: "/onboarding/company" }));
    const cookie = auth.cookies.get("g_oauth")!; assert(cookie.httpOnly);
    const saved = JSON.parse(cookie.value); assert.deepEqual(saved.roles, ["mentor", "investor"]);
    const req = new NextRequest(`https://example.test/api/auth/google/callback?state=${saved.state}&code=qa`); req.cookies.set("g_oauth", cookie.value);
    assert.equal((await callback.GET(req)).status, 307);
    const google = await db.user.findUniqueOrThrow({ where: { email: googleEmail }, include: { matchmakingProfile: true } }); ids.push(google.id);
    assert.deepEqual(google.matchmakingProfile!.roles, ["mentor", "investor"]);
    assert.equal((await cards.getMyCard(google.id)).hasPhoto, true);
    googleImage = "https://lh3.googleusercontent.com/a/updated=s96-c";
    assert.equal((await access.features(google.id)).verifiedInvestor, false); assert.equal((await access.features(google.id)).network, false);
    req.cookies.set("g_oauth", JSON.stringify({ ...saved, roles: ["buyer"] })); await callback.GET(req);
    assert.deepEqual((await db.matchmakingProfile.findUniqueOrThrow({ where: { userId: google.id } })).roles, ["mentor", "investor"], "Existing Google login must not overwrite identities");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: google.id } })).image, googleImage);
    env.MEMBER_NETWORK_ENABLED = "false";
    const off = await registration.registerWithReferral({ email: `roles-off-${randomUUID()}@example.invalid` }, undefined, ["buyer", "partner"]); ids.push(off.id);
    assert.deepEqual((await db.matchmakingProfile.findUniqueOrThrow({ where: { userId: off.id } })).roles, ["buyer", "partner"]);
    env.MEMBER_NETWORK_ENABLED = "true";
    await db.user.update({ where: { id: google.id }, data: { plan: "business", subscriptionStatus: "ACTIVE", paypalSubscriptionId: `qa-${randomUUID()}`, currentPeriodEnd: new Date(Date.now() + 86400000) } });
    const companyName = `QA roles ${randomUUID()}`;
    await db.onboardingProfile.create({ data: { userId: owner.id, companyName, country: "TW", industry: "saas", targetMarkets: [], needs: [] } });
    await db.matchmakingProfile.update({ where: { userId: owner.id }, data: { visible: true } });
    for (const role of ["founder", "mentor"] as const) {
      const result = await cards.listCards(google.id, null, 1, { role, q: companyName });
      assert.equal(result.cards.length, 1); assert.deepEqual(Array.from(result.cards[0].roles!), ["founder", "mentor"]);
    }
    assert.equal((await cards.listCards(google.id, null, 1, { role: "buyer", q: companyName })).cards.length, 0);
    let before = await cards.getMyCard(owner.id);
    const save = cardWriteSchema.parse({ action: "save", revision: before.revision, requestId: randomUUID(), draft: { ...before.draft, roles: ["mentor", "founder"], role: "mentor" } });
    before = await cards.writeMyCard(owner.id, save);
    assert.equal((await cards.writeMyCard(owner.id, save)).revision, before.revision, "Same request is idempotent");
    await assert.rejects(cards.writeMyCard(owner.id, { ...save, requestId: randomUUID() }));
    const oldDraft = { ...before.draft }; delete oldDraft.roles;
    before = await cards.writeMyCard(owner.id, { action: "save", revision: before.revision, requestId: randomUUID(), draft: oldDraft });
    assert.deepEqual(Array.from(before.draft.roles!), ["mentor", "founder"], "Legacy editor does not remove secondary roles");
    await db.user.update({ where: { id: owner.id }, data: { plan: "business", subscriptionStatus: "ACTIVE", paypalSubscriptionId: `qa-${randomUUID()}`, currentPeriodEnd: new Date(Date.now() + 86400000) } });
    const googleCompany = `Google photo ${randomUUID()}`;
    await db.onboardingProfile.create({ data: { userId: google.id, companyName: googleCompany, country: "TW", industry: "saas", targetMarkets: [], needs: [] } });
    await db.matchmakingProfile.update({ where: { userId: google.id }, data: { visible: true } });
    const imported = await cards.getMemberCard(owner.id, google.matchmakingProfile!.id);
    assert(imported.photo?.startsWith('/api/matchmaking/members/')); assert(!JSON.stringify(imported).includes('googleusercontent'));
    assert((await cards.listCards(owner.id, null, 1, { q: googleCompany })).cards[0].photo);
    const rounds = load<typeof import("../src/lib/roundtables/service")>("src/lib/roundtables/service.ts");
    assert.equal((await rounds.getRoundtables(owner.id)).canApply, true, "Founder secondary identity remains eligible");
    let investor = await cards.getMyCard(google.id);
    await db.matchmakingProfile.update({ where: { userId: google.id }, data: { verified: true } });
    investor = await cards.writeMyCard(google.id, { action: "save", revision: investor.revision, requestId: randomUUID(), draft: { ...investor.draft, roles: ["mentor", "investor", "founder"] } });
    assert.equal(investor.verified, true);
    investor = await cards.writeMyCard(google.id, { action: "save", revision: investor.revision, requestId: randomUUID(), draft: { ...investor.draft, roles: ["mentor", "investor", "buyer"] } });
    assert.equal(investor.verified, false, "Adding another protected role needs a fresh review");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).trialPolicy, owner.trialPolicy);
  } finally {
    const created = await db.user.findMany({ where: { OR: [{ id: { in: ids } }, { email: { in: [email, googleEmail] } }] }, select: { id: true } });
    await db.user.deleteMany({ where: { id: { in: created.map(v => v.id) } } }); await db.$disconnect();
  }
});
