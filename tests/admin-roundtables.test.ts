import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pdfRuntime } from "./helpers/pdf-runtime";
import { adminRoundtableMutationSchema, roundtableMutationSchema } from "../src/lib/roundtables/schema";

const mentor = { publicName: "Admin QA host", bio: "Certified customer discovery mentor for isolated QA.", expertise: "Customer interviews and paid pilot offers.", references: ["https://example.invalid/PRIVATE_REFERENCE"], languages: ["en"], industries: ["saas"] };
const draft = { topic: "Admin scheduled customer roundtable", description: "Discuss real customer evidence and next steps.", steps: ["01-1"], industry: "saas", languages: ["en"], startsAt: "2090-11-06T02:00:00Z", endsAt: "2090-11-06T03:00:00Z", timezone: "Asia/Taipei", capacity: 4, registrationMode: "instant", meetingUrl: "https://meet.google.com/admin-private-room" };

test("Admin roundtable operations cannot forge certification, delegate through member API or manage attendee-private actions", () => {
  const input = { action: "create", hostId: "host", requestId: randomUUID(), draft };
  assert(adminRoundtableMutationSchema.safeParse(input).success);
  assert(!roundtableMutationSchema.safeParse(input).success);
  for (const patch of [{ status: "approved" }, { hostId: "host", draft: { ...draft, capacity: 7 } }, { draft: { ...draft, meetingUrl: "javascript:alert(1)" } }]) assert(!adminRoundtableMutationSchema.safeParse({ ...input, ...patch }).success);
  for (const action of ["mentorApply", "decide", "finish", "prepare", "feedback", "apply"]) assert(!adminRoundtableMutationSchema.safeParse({ ...input, action }).success);
  assert(!adminRoundtableMutationSchema.safeParse({ action: "edit", id: "s", revision: 0, draft, hostId: "other-host" }).success);
});

test("Admin API uses real isolated transactions, host checks, revisions and shared member data", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) }), users: string[] = [];
  let authenticated = true, limited = false;
  const load = pdfRuntime({
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/auth/guard": { requireAdmin: async () => authenticated ? { email: "admin@example.invalid", role: "admin" } : null },
    "@/lib/rate-limit": { MINUTE_MS: 60000, checkRateLimit: async () => ({ ok: !limited, retryAfterMs: 30000 }) },
    "@/lib/network/access": { networkAccount: async (id: string, tx = db) => { const u = await tx.user.findUniqueOrThrow({ where: { id }, include: { matchmakingProfile: true } }); return { ...u, effectivePlan: u.plan }; }, features: async () => ({ network: true }) },
    "@/lib/network/notifications": { queueNotification: async (tx: typeof db, userId: string, eventKey: string, kind: string, payload: object) => tx.memberNotification.upsert({ where: { eventKey }, create: { userId, eventKey, kind, payload }, update: {} }) },
  }, { JSON, SyntaxError });
  const api = load<typeof import("../src/app/api/admin/roundtables/route")>("src/app/api/admin/roundtables/route.ts");
  const service = load<typeof import("../src/lib/roundtables/service")>("src/lib/roundtables/service.ts");
  const post = (value: unknown, headers: Record<string, string> = {}) => api.POST(new Request("https://qa.invalid/api/admin/roundtables", { method: "POST", headers: { origin: "https://qa.invalid", "content-type": "application/json", ...headers }, body: typeof value === "string" ? value : JSON.stringify(value) }));
  async function user() { const u = await db.user.create({ data: { email: randomUUID() + "@admin-roundtable.invalid", plan: "business", matchmakingProfile: { create: { role: "founder", categories: ["mentorship"], country: "TW", industry: "saas", slogan: "QA", offers: "QA mentorship", looksFor: "QA peers", visible: true } } } }); users.push(u.id); return u; }
  try {
    const host = await user(), member = await user(), unapproved = await user();
    await db.mentorCertification.create({ data: { userId: host.id, status: "approved", draft: mentor, revision: 1 } });
    const input = { action: "create", hostId: host.id, requestId: randomUUID(), draft };
    let id = "";
    await t.test("Authorization, origin, content type, body size, schema and rate limits precede writes", async () => {
      authenticated = false;
      assert.equal((await api.GET()).status, 401); assert.equal((await post(input)).status, 401);
      authenticated = true;
      assert.equal((await post(input, { origin: "https://evil.invalid" })).status, 403);
      assert.equal((await post(input, { "content-type": "text/plain" })).status, 415);
      assert.equal((await post("{" )).status, 400);
      assert.equal((await post(" ".repeat(40001))).status, 413);
      assert.equal((await post({ ...input, status: "approved" })).status, 400);
      limited = true; assert.equal((await post(input)).status, 429); limited = false;
      const denied = await post({ ...input, hostId: unapproved.id }); assert.equal(denied.status, 403); assert.match((await denied.json()).error, /certification/);
      assert.equal(await db.roundtable.count({ where: { hostId: { in: users } } }), 0);
    });
    await t.test("Create appears in the same member query; retry creates one session, edit is versioned", async () => {
      const response = await post(input); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
      const state = (await response.json()).data; id = state.selectedId;
      assert.equal(state.sessions.find((s: { id: string }) => s.id === id).hostId, host.id);
      assert.equal((await (await post(input)).json()).data.selectedId, id);
      assert.equal(await db.roundtable.count({ where: { hostId: host.id } }), 1);
      assert.equal((await post({ ...input, draft: { ...draft, topic: "Changed uncertain retry" } })).status, 409);
      const publicRow = (await service.getRoundtables(member.id, id)).sessions.find(s => s.id === id)!;
      assert.equal(publicRow.topic, draft.topic); assert.equal(publicRow.meetingUrl, null);
      const edit = { action: "edit", id, revision: 0, draft: { ...draft, topic: "Updated admin roundtable topic" } };
      assert.equal((await post(edit)).status, 200); assert.equal((await post(edit)).status, 409);
      assert.equal((await service.getRoundtables(member.id, id)).sessions.find(s => s.id === id)!.topic, edit.draft.topic);
    });
    await t.test("Applications freeze edits; admin sees counts without private questions, notes or references", async () => {
      await service.mutateRoundtable(member.id, roundtableMutationSchema.parse({ action: "apply", id, name: "QA member", question: "PRIVATE_MEMBER_QUESTION", consent: true }));
      const reg = await db.roundtableRegistration.findUniqueOrThrow({ where: { roundtableId_userId: { roundtableId: id, userId: member.id } } });
      await service.mutateRoundtable(member.id, roundtableMutationSchema.parse({ action: "prepare", id, revision: reg.revision, question: "PRIVATE_PREPARATION", share: false }));
      const response = await api.GET(), state = (await response.json()).data, row = state.sessions.find((s: { id: string }) => s.id === id);
      assert.equal(row.confirmed, 2); assert.equal(row.registrations, 1);
      assert(!JSON.stringify(state).includes("PRIVATE_"));
      assert.equal((await post({ action: "edit", id, revision: row.revision, draft })).status, 409);
      assert.equal((await post({ action: "meetingLink", id, revision: row.revision, meetingUrl: "https://meet.google.com/admin-updated-room" })).status, 200);
      assert.equal((await service.getRoundtables(member.id, id)).sessions.find(s => s.id === id)!.meetingUrl, "https://meet.google.com/admin-updated-room");
      assert.equal((await post({ action: "meetingLink", id, revision: row.revision, meetingUrl: draft.meetingUrl })).status, 409);
    });
    await t.test("Cancel preserves registration, reason and notifications; revoked and missing hosts cannot be delegated", async () => {
      const current = await db.roundtable.findUniqueOrThrow({ where: { id } });
      assert.equal((await post({ action: "cancel", id, revision: current.revision, reason: "Actual QA schedule changed" })).status, 200);
      const row = await db.roundtable.findUniqueOrThrow({ where: { id } }); assert.equal(row.status, "cancelled"); assert.equal(row.cancelReason, "Actual QA schedule changed");
      assert.equal(await db.roundtableRegistration.count({ where: { roundtableId: id } }), 1);
      assert.equal(await db.memberNotification.count({ where: { userId: member.id, eventKey: { contains: ":cancel:" } } }), 1);
      assert.equal((await post({ action: "cancel", id: "missing", revision: 0, reason: "Missing QA session" })).status, 404);
      await db.mentorCertification.update({ where: { userId: host.id }, data: { status: "revoked" } });
      assert.equal((await post({ ...input, requestId: randomUUID(), draft: { ...draft, startsAt: "2090-11-07T02:00:00Z", endsAt: "2090-11-07T03:00:00Z" } })).status, 403);
    });
  } finally {
    await db.roundtable.deleteMany({ where: { hostId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users }, email: { endsWith: "@admin-roundtable.invalid" } } });
    await db.$disconnect();
  }
});

test("Session edit drafts retain the original version and require comparison of all latest fields before retrying", async () => {
  for (const locale of ["en", "zh-tw"]) for (const revision of [undefined, 0]) {
    const slots: unknown[] = [], writes: Array<{ revision: number; draft: { topic: string } }> = [];
    let cursor = 0;
    const load = pdfRuntime({ react: { ...React, useEffect() {}, useRef: () => ({ current: false }), useState(value: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], (v: unknown) => { slots[i] = v; }]; } }, "next-intl": { useLocale: () => locale } }, { localStorage: { setItem() {}, removeItem() {} }, crypto: { randomUUID } });
    const { SessionForm } = load<typeof import("../src/components/dashboard/roundtables/Forms")>("src/components/dashboard/roundtables/Forms.tsx");
    const props = { userId: "admin:draft-qa", initial: { ...draft, id: "qa-session", revision: 1, frameworkStages: [2], description: "LATEST_SERVER_DESCRIPTION" }, disabled: false, write: async (input: unknown) => { writes.push(input as typeof writes[number]); return true; } };
    const render = () => { cursor = 0; return SessionForm(props); };
    render(); slots[0] = { ...slots[0] as object, revision, topic: "UNSAVED_TOPIC" };
    render().props.onSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>); await Promise.resolve();
    assert.equal(writes.length, 0); assert.equal((slots[0] as { topic: string }).topic, "UNSAVED_TOPIC");
    const html = renderToStaticMarkup(render()); assert.match(html, /HTTP 409/); assert.match(html, /LATEST_SERVER_DESCRIPTION/); assert.match(html, /Asia\/Taipei/); assert.match(html, /admin-private-room/);
    function find(node: React.ReactNode): React.ReactElement<{ onClick(): void }> | undefined {
      let found: React.ReactElement<{ onClick(): void }> | undefined;
      React.Children.forEach(node, child => { if (!React.isValidElement<{ children?: React.ReactNode; onClick(): void }>(child)) return; if (child.type === "button" && child.props.children === (locale === "en" ? "Compared; use latest version to retry" : "已比較，使用最新版本重試")) found = child; else found ||= find(child.props.children); });
      return found;
    }
    find(render())!.props.onClick(); render().props.onSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>); await Promise.resolve();
    assert.equal(writes.length, 1); assert.equal(writes[0].revision, 1); assert.equal(writes[0].draft.topic, "UNSAVED_TOPIC"); assert.equal((slots[0] as { revision: number }).revision, 2);
  }
});
