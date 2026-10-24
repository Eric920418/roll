import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as cards from "../src/lib/matchmaking/schema";
import * as mindset from "../src/lib/mindset/schema";
import { emptyInsight } from "../src/lib/customer-insights/schema";

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const require = createRequire(import.meta.url), loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module: loaded, exports: loaded.exports, console, process, Date, Error, SyntaxError, Buffer, Request, Response, URL, File, FormData, Uint8Array, require: (id: string) => id in mocks ? mocks[id] : require(id) });
  return loaded.exports as T;
}
const draft: cards.CardDraft = { role: "founder", categories: ["collaboration"], country: "Taiwan", industry: "SaaS", slogan: "A useful product", offers: "Product expertise", looksFor: "A distribution partner", visibleFields: ["country", "industry", "slogan", "offers", "looksFor"] };
const insight = (company: string) => ({ ...emptyInsight("discover"), company, notes: "Actual customer conversation notes" });

test("Matchmaking evidence counts valid prospect companies across workspaces, normalizes names, excludes empty / other-role evidence", () => {
  assert.equal(cards.interviewCompanies([insight("ＡＣＭＥ"), { ...insight(" acme "), actionId: "another-workspace" }, insight("Second"), { ...insight("Third"), journeyId: "journey" }, { ...insight("MentorCo"), type: "Mentor" }, { ...insight("Empty"), notes: "" }, { name: "invalid" }]), 3);
});
test("Card writes require explicit consent and reject client-controlled verification / identity / visibility", () => {
  const input = { action: "publish", revision: 0, requestId: randomUUID(), draft };
  assert.equal(cards.cardWriteSchema.safeParse(input).success, false);
  assert.equal(cards.cardWriteSchema.safeParse({ ...input, confirmed: true }).success, true);
  for (const extra of [{ verified: true }, { visible: true }, { userId: "other" }, { name: "secret" }]) assert.equal(cards.cardWriteSchema.safeParse({ ...input, confirmed: true, draft: { ...draft, ...extra } }).success, false);
  assert.equal(cards.cardDraftSchema.safeParse({ ...draft, visibleFields: ["email"] }).success, false);
  assert.equal(cards.cardDraftSchema.safeParse({ ...draft, categories: [] }).success, false);
});
test("Public projection strips private identity, blob paths, hidden fields and uses only visible exact-match reasons", () => {
  const row = { ...draft, id: "card", name: "Secret Person", org: "Secret Company", email: "secret@invalid.test", originalPhoto: "private/original", blurredPhoto: "private/blurred", verified: true, recommended: true, lastActiveAt: new Date(), visibleFields: ["industry", "photo"] as cards.CardDraft["visibleFields"] };
  const result = cards.publicCard(row, { oneLinePitch: "Private pitch", icp: "Private ICP", targetMarkets: ["Taiwan"] }, { interviews: 3, milestones: 1, payingCustomers: 4 }, { industry: " SaaS ", targetMarkets: ["Taiwan"] });
  assert.deepEqual(result.reasons, ["industry"]); assert.equal(result.verified, false);
  assert.deepEqual(Object.keys(result).sort(), ["activity", "categories", "id", "industry", "photo", "reasons", "recommended", "role", "verified"].sort());
  assert.equal(result.photo, "/api/matchmaking/members/card/photo");
  assert.doesNotMatch(JSON.stringify(result), /Secret|private\/|secret@|Private/);
  assert.deepEqual(cards.overlapReasons({ industry: "HealthTech", targetMarkets: ["ＴＡＩＷＡＮ"] }, { industry: "Health", markets: [" taiwan "] }), ["market"]);
});
test("Activity boundaries and private reflection validation are deterministic", () => {
  const now = new Date("2026-10-24T00:00:00Z");
  assert.equal(cards.activityGroup(null, now), "inactive");
  assert.equal(cards.activityGroup(new Date(now.getTime() - 7 * 86400000 + 1), now), "week");
  assert.equal(cards.activityGroup(new Date(now.getTime() - 7 * 86400000), now), "month");
  assert.equal(cards.activityGroup(new Date(now.getTime() - 30 * 86400000), now), "inactive");
  assert.equal(mindset.reflectionSchema.safeParse({ blocker: " ", controllable: "", nextAction: "" }).success, false);
  assert.equal(mindset.reflectionSchema.safeParse({ blocker: "", controllable: "", nextAction: "x" }).success, true);
  assert.equal(mindset.reflectionSchema.safeParse({ blocker: "x".repeat(2001), controllable: "", nextAction: "" }).success, false);
});
test("Bilingual keys and sidebar entries are complete without changing public website Community", () => {
  const en = JSON.parse(readFileSync("messages/en.json", "utf8")), zh = JSON.parse(readFileSync("messages/zh-tw.json", "utf8"));
  function keys(value: Record<string, unknown>, prefix = ""): string[] { return Object.entries(value).flatMap(([key, val]) => typeof val === "object" && val ? keys(val as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]); }
  assert.deepEqual(keys(en.Matchmaking), keys(zh.Matchmaking)); assert.deepEqual(keys(en.Mindset), keys(zh.Mindset));
  const sidebar = readFileSync("src/components/dashboard/DashboardSidebar.tsx", "utf8");
  assert.match(sidebar, /path: "\/dashboard\/matchmaking"/); assert.match(sidebar, /path: "\/dashboard\/mindset"/); assert.doesNotMatch(sidebar, /\/dashboard\/community/);
});

const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL;
test("Matchmaking and Mindset integration in isolated PostgreSQL", { skip: !connectionString }, async t => {
  const url = new URL(connectionString!);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const ids: string[] = [], state = { uid: null as string | null, admin: false, limited: false };
  const api = { ok: (data: unknown, status = 200) => Response.json({ data }, { status }), fail: (error: string, status = 400) => Response.json({ error }, { status }), failFromError: () => Response.json({ error: "Server failure", code: "internal", requestId: "safe-trace" }, { status: 500 }), unauthorized: () => Response.json({ error: "Login required" }, { status: 401 }), rateLimited: () => Response.json({ error: "Limited" }, { status: 429 }) };
  const mocks = { "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/api": api, "@/lib/auth/guard": { getUserSession: async () => state.uid ? { uid: state.uid } : null, getAdminSession: async () => state.admin ? { role: "admin" } : null }, "@/lib/rate-limit": { MINUTE_MS: 60000, checkRateLimit: async () => ({ ok: !state.limited }) } };
  const http = load<typeof import("../src/lib/member-http")>("src/lib/member-http.ts", mocks);
  const base = { ...mocks, "@/lib/member-http": http, "./schema": cards };
  const service = load<typeof import("../src/lib/matchmaking/service")>("src/lib/matchmaking/service.ts", base);
  const reflections = load<typeof import("../src/lib/mindset/service")>("src/lib/mindset/service.ts", { ...base, "./schema": mindset });
  const routes = { ...base, "@/lib/matchmaking/service": service, "@/lib/mindset/service": reflections };
  const me = load<typeof import("../src/app/api/matchmaking/me/route")>("src/app/api/matchmaking/me/route.ts", routes);
  const admin = load<typeof import("../src/app/api/admin/matchmaking/route")>("src/app/api/admin/matchmaking/route.ts", routes);
  const member = load<typeof import("../src/app/api/matchmaking/members/[id]/route")>("src/app/api/matchmaking/members/[id]/route.ts", routes);
  const entries = load<typeof import("../src/app/api/mindset/route")>("src/app/api/mindset/route.ts", routes);
  const entry = load<typeof import("../src/app/api/mindset/[id]/route")>("src/app/api/mindset/[id]/route.ts", routes);
  const request = (path: string, body?: unknown, method = "PATCH", origin = "https://example.test") => new Request(`https://example.test/api/${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const createUser = async () => { const user = await db.user.create({ data: { email: `${randomUUID()}@matchmaking.invalid`, firstName: "Never public" } }); ids.push(user.id); return user; };
  const blobs = new Map<string, Buffer>(); let failUpload = false, uploadCalls = 0;
  const photos = load<typeof import("../src/lib/matchmaking/photo")>("src/lib/matchmaking/photo.ts", { ...routes, "./service": service, "@vercel/blob": {
    put: async (pathname: string, bytes: Buffer, options: { access: string }) => { assert.equal(options.access, "private"); uploadCalls++; if (failUpload) throw new Error("Storage unavailable"); blobs.set(pathname, bytes); return { pathname }; },
    get: async (path: string, options: { access: string; useCache: boolean }) => { assert.equal(options.access, "private"); assert.equal(options.useCache, false); return { statusCode: 200, stream: blobs.get(path) }; },
  } });
  const photoRoute = load<typeof import("../src/app/api/matchmaking/me/photo/route")>("src/app/api/matchmaking/me/photo/route.ts", { ...routes, "@/lib/matchmaking/photo": photos });
  const originalToken = process.env.MATCHMAKING_BLOB_READ_WRITE_TOKEN;
  let cardId = "", reflectionId = "";
  try {
    const user = await createUser(), other = await createUser(); state.uid = user.id;
    await db.onboardingProfile.create({ data: { userId: user.id, companyName: "Private org", oneLinePitch: "Live pitch", icp: "Live ICP", industry: "SaaS", country: "Taiwan", targetMarkets: ["Taiwan"], needs: [] } });
    await t.test("Authorization, strict writes, explicit consent and founder gate run before publication", async () => {
      state.uid = null; assert.equal((await me.GET()).status, 401); state.uid = user.id;
      assert.equal((await me.PATCH(request("matchmaking/me", {}, "PATCH", "https://evil.test"))).status, 403);
      assert.equal((await me.PATCH(request("matchmaking/me", { action: "publish", revision: 0, requestId: randomUUID(), draft }))).status, 400);
      assert.equal((await me.PATCH(request("matchmaking/me", { action: "publish", revision: 0, requestId: randomUUID(), draft, confirmed: true }))).status, 403);
      const input = { action: "save" as const, revision: 0, requestId: randomUUID(), draft };
      const result = await service.writeMyCard(user.id, input); cardId = result.id!;
      assert.equal(result.visible, false); assert.equal((await service.listCards(other.id, "all", 1)).cards.some(card => card.id === cardId), false);
      assert.equal((await service.writeMyCard(user.id, input)).revision, 1);
      await assert.rejects(service.writeMyCard(user.id, { ...input, draft: { ...draft, slogan: "Changed replay" } }), /changed/);
      state.limited = true; assert.equal((await me.GET()).status, 429); state.limited = false;
    });
    await t.test("Cross-workspace evidence enables opt-in; projection stays anonymous and Profile changes sync only selected fields", async () => {
      for (const name of ["ACME", " acme ", "Second", "Third"]) await db.meetingNote.create({ data: { userId: user.id, title: "Private customer", insight: insight(name) } });
      const result = await service.writeMyCard(user.id, { action: "publish", revision: 1, requestId: randomUUID(), confirmed: true, draft: { ...draft, visibleFields: ["industry", "companyPitch", "icp", "stats", "photo", "markets"] } });
      assert.equal(result.stats.interviews, 3); assert.equal(result.visible, true); assert(result.optedInAt);
      const projected = await service.getMemberCard(other.id, cardId);
      assert.equal(projected.companyPitch, "Live pitch"); assert.equal(projected.icp, "Live ICP"); assert.equal(projected.country, undefined);
      assert.doesNotMatch(JSON.stringify(projected), /Private org|Never public|@matchmaking|Private customer/);
      await db.onboardingProfile.update({ where: { userId: user.id }, data: { oneLinePitch: "New pitch", icp: "New ICP" } });
      assert.equal((await service.getMemberCard(other.id, cardId)).companyPitch, "New pitch");
      assert.equal((await service.listCards(other.id, "investors", 1)).cards.some(card => card.id === cardId), false);
      const response = await member.GET(request("matchmaking/member", undefined, "GET"), context(cardId)); assert.equal(response.headers.get("cache-control"), "private, no-store");
    });
    await t.test("Parallel card edits have one winner, activity is throttled, hidden detail cannot be read", async () => {
      const row = await service.getMyCard(user.id);
      const writes = await Promise.allSettled([1, 2].map(n => service.writeMyCard(user.id, { action: "save", revision: row.revision, requestId: randomUUID(), draft: { ...row.draft, slogan: `Version ${n}` } })));
      assert.equal(writes.filter(v => v.status === "fulfilled").length, 1);
      const now = new Date(); await service.recordActivity(user.id, now); await service.recordActivity(user.id, new Date(now.getTime() + 1000));
      assert.equal((await db.matchmakingProfile.findUniqueOrThrow({ where: { userId: user.id } })).lastActiveAt?.getTime(), now.getTime());
      await service.writeMyCard(user.id, { action: "hide", revision: (await service.getMyCard(user.id)).revision, requestId: randomUUID() });
      await assert.rejects(service.getMemberCard(other.id, cardId), /not found/);
    });
    await t.test("Other roles can opt in; only admins verify, and changing roles clears verification", async () => {
      const row = await service.getMyCard(other.id);
      const saved = await service.writeMyCard(other.id, { action: "publish", revision: row.revision, requestId: randomUUID(), confirmed: true, draft: { ...draft, role: "investor", categories: ["investors"] } });
      const input = { id: saved.id!, revision: saved.revision, verified: true, recommended: true };
      assert.equal((await admin.PATCH(request("admin/matchmaking", input))).status, 401);
      state.admin = true; assert.equal((await admin.PATCH(request("admin/matchmaking", input))).status, 200);
      assert.equal((await service.getMemberCard(user.id, saved.id!)).verified, true);
      const current = await service.getMyCard(other.id); await service.writeMyCard(other.id, { action: "save", revision: current.revision, requestId: randomUUID(), draft: { ...current.draft, role: "mentor" } });
      assert.equal((await service.getMemberCard(user.id, saved.id!)).verified, false); state.admin = false;
    });
    await t.test("Photos validate decoded formats, strip metadata, protect originals and retain old paths on failure", async () => {
      const bytes = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#113355" } }).jpeg().withMetadata({ exif: { IFD0: { Artist: "Private person" } } }).toBuffer();
      const buffers = await photos.photoBuffers(bytes, "image/jpeg");
      assert.equal((await sharp(buffers.original).metadata()).exif, undefined); assert.equal((await sharp(buffers.blurred).metadata()).width, 480);
      await assert.rejects(photos.photoBuffers(bytes, "image/png"), /Invalid image/);
      await assert.rejects(photos.photoBuffers(Buffer.alloc(3 * 1024 * 1024 + 1), "image/jpeg"), /3 MiB/);
      await assert.rejects(photos.photoBuffers(Buffer.from("<svg></svg>"), "image/svg+xml"), /required/);
      const huge = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: "white" } }).png().toBuffer();
      await assert.rejects(photos.photoBuffers(huge, "image/png"), /20 million/);
      delete process.env.MATCHMAKING_BLOB_READ_WRITE_TOKEN;
      await assert.rejects(photos.savePhoto(user.id, (await service.getMyCard(user.id)).revision, randomUUID(), bytes, "image/jpeg"), /not configured/);
      process.env.MATCHMAKING_BLOB_READ_WRITE_TOKEN = "private-test-token";
      const revision = (await service.getMyCard(user.id)).revision, requestId = randomUUID();
      await photos.savePhoto(user.id, revision, requestId, bytes, "image/jpeg"); await photos.savePhoto(user.id, revision, requestId, bytes, "image/jpeg"); assert.equal(uploadCalls, 2);
      const before = await db.matchmakingProfile.findUniqueOrThrow({ where: { userId: user.id } });
      failUpload = true; await assert.rejects(photos.savePhoto(user.id, before.revision, randomUUID(), bytes, "image/jpeg"), /unavailable/); failUpload = false;
      assert.equal((await db.matchmakingProfile.findUniqueOrThrow({ where: { userId: user.id } })).originalPhoto, before.originalPhoto);
      assert.equal((await photos.readPhoto(user.id)).headers.get("cache-control"), "private, no-store");
      await assert.rejects(photos.readPhoto(other.id), /not found/); await assert.rejects(photos.readPhoto(other.id, cardId), /not found/);
      const owner = await service.getMyCard(user.id); await service.writeMyCard(user.id, { action: "publish", revision: owner.revision, requestId: randomUUID(), confirmed: true, draft: owner.draft });
      const response = await photos.readPhoto(other.id, cardId); assert.equal(response.headers.get("cache-control"), "private, no-store");
      const otherBytes = Buffer.from(await response.arrayBuffer()); assert.deepEqual(otherBytes, buffers.blurred);
    });
    await t.test("Reflection create retries are idempotent, strict, private and do not affect rewards or cards", async () => {
      state.uid = user.id; const input = { requestId: randomUUID(), reflection: { blocker: "PRIVATE thought", controllable: "My next test", nextAction: "Talk to one person" } };
      const responses = await Promise.all([entries.POST(request("mindset", input, "POST")), entries.POST(request("mindset", input, "POST"))]);
      assert(responses.every(r => r.status === 201)); const body = await responses[0].json(); reflectionId = body.data.id;
      assert.equal(await db.mindsetEntry.count({ where: { userId: user.id } }), 1);
      assert.deepEqual(Object.keys(body.data).sort(), ["id", "revision", "blocker", "controllable", "nextAction", "createdAt", "updatedAt"].sort());
      assert.equal((await entries.POST(request("mindset", { ...input, reflection: { ...input.reflection, blocker: "Different replay" } }, "POST"))).status, 409);
      state.uid = other.id; assert.equal((await entry.GET(request("mindset/x", undefined, "GET"), context(reflectionId))).status, 404);
      assert.equal((await entry.PATCH(request("mindset/x", { ...input, revision: 1 }), context(reflectionId))).status, 404);
      assert.equal((await entry.DELETE(request("mindset/x", { requestId: randomUUID(), revision: 1 }), context(reflectionId))).status, 404);
      assert.equal((await reflections.listReflections(other.id, 1)).entries.length, 0);
      assert.doesNotMatch(JSON.stringify(await service.getMemberCard(other.id, cardId)), /PRIVATE thought/); assert.equal(await db.rewardEntry.count({ where: { userId: user.id } }), 0);
    });
    await t.test("Photo upload boundary rejects malformed multipart, missing versions and oversized chunked bodies", async () => {
      state.uid = user.id;
      const malformed = new Request("https://example.test/api/matchmaking/me/photo", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "multipart/form-data; boundary=missing" }, body: "not-a-valid-multipart" });
      assert.equal((await photoRoute.POST(malformed)).status, 400);
      const form = new FormData(); form.set("photo", new File([new Uint8Array([1, 2])], "bad.png", { type: "image/png" })); form.set("requestId", randomUUID());
      const missingRevision = new Request("https://example.test/api/matchmaking/me/photo", { method: "POST", headers: { Origin: "https://example.test" }, body: form });
      assert.equal((await photoRoute.POST(missingRevision)).status, 400);
      const oversized = new Request("https://example.test/api/matchmaking/me/photo", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "multipart/form-data; boundary=test" }, body: new Uint8Array(3 * 1024 * 1024 + 65537) });
      assert.equal(oversized.headers.get("content-length"), null); assert.equal((await photoRoute.POST(oversized)).status, 413);
      assert.equal((await me.PATCH(new Request("https://example.test/api/matchmaking/me", { method: "PATCH", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: "{" }))).status, 400);
    });
    await t.test("Category pagination and activity ordering stay stable and never include hidden or self cards", async () => {
      const newIds: string[] = [];
      for (let i = 0; i < 26; i++) {
        const member = await createUser(); newIds.push(member.id);
        await db.matchmakingProfile.create({ data: { ...draft, userId: member.id, role: "mentor", categories: ["first-customers"], visible: true, optedInAt: new Date(), lastActiveAt: i === 25 ? null : new Date(Date.UTC(2026, 9, i + 1)) } });
      }
      const first = await service.listCards(user.id, "first-customers", 1), second = await service.listCards(user.id, "first-customers", 2);
      const expected = await db.matchmakingProfile.findMany({ where: { visible: true, userId: { not: user.id }, categories: { has: "first-customers" } }, orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { id: "asc" }] });
      assert.equal(first.cards.length, 24); assert.equal(second.cards.length, expected.length - 24); assert.equal(first.hasMore, true); assert.equal(second.hasMore, false);
      assert.equal(new Set([...first.cards, ...second.cards].map(c => c.id)).size, expected.length);
      assert.equal(expected.filter(c => newIds.includes(c.userId)).length, 26);
      assert.deepEqual([...first.cards, ...second.cards].map(c => c.id), expected.map(c => c.id));
    });
    await t.test("Concurrent reflection edits reject stale versions; deletion erases text and cannot replay creation to resurrect it", async () => {
      state.uid = user.id; const input = { revision: 1, requestId: randomUUID(), reflection: { blocker: "new", controllable: "", nextAction: "" } };
      const results = await Promise.all([entry.PATCH(request("mindset/x", input), context(reflectionId)), entry.PATCH(request("mindset/x", { ...input, requestId: randomUUID() }), context(reflectionId))]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const latest = await reflections.getReflection(user.id, reflectionId);
      assert.equal(latest.revision, 2); const remove = { revision: latest.revision, requestId: randomUUID() };
      assert.equal((await entry.DELETE(request("mindset/x", remove), context(reflectionId))).status, 200); assert.equal((await entry.DELETE(request("mindset/x", remove), context(reflectionId))).status, 200);
      const deleted = await db.mindsetEntry.findUniqueOrThrow({ where: { id: reflectionId } }); assert.equal(deleted.blocker + deleted.controllable + deleted.nextAction, "");
      await assert.rejects(reflections.createReflection(user.id, deleted.createRequestId, { blocker: "PRIVATE thought", controllable: "My next test", nextAction: "Talk to one person" }), /changed/);
      assert.equal((await reflections.listReflections(user.id, 1)).entries.length, 0);
    });
  } finally {
    if (originalToken === undefined) delete process.env.MATCHMAKING_BLOB_READ_WRITE_TOKEN; else process.env.MATCHMAKING_BLOB_READ_WRITE_TOKEN = originalToken;
    await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  }
});
