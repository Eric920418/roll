import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pdfRuntime } from "./helpers/pdf-runtime";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { roundtableMutationSchema, mentorDraftSchema, sessionDraftSchema, httpsUrl } from "../src/lib/roundtables/schema";
import type { RoundtableMutation } from "../src/lib/roundtables/schema";
const mentor = { publicName: "QA certified mentor", bio: "Experienced founder and mentor in evidence-based customer development.", expertise: "Customer discovery and paid pilot experiments.", references: ["https://example.com/private-reference"], languages: ["en" as const, "zh-tw" as const], industries: ["saas" as const] };
test("Mentor URLs normalize missing HTTPS and return validation errors without throwing", () => {
  const result = mentorDraftSchema.safeParse({ ...mentor, references: [" https://www.rollgrp.com ", "www.linkedin.com/in/qa-mentor", "example.com/profile"] });
  assert(result.success);
  assert.deepEqual(result.data.references, ["https://www.rollgrp.com", "https://www.linkedin.com/in/qa-mentor", "https://example.com/profile"]);
  for (const url of ["not a URL", "", "http://example.com", "javascript:alert(1)", "data:text/plain,hello", "https://user:password@example.com", "//example.com/profile"]) {
    assert.doesNotThrow(() => assert(!mentorDraftSchema.safeParse({ ...mentor, references: [url] }).success));
    assert.doesNotThrow(() => assert(!httpsUrl.safeParse(url).success));
  }
  assert(!mentorDraftSchema.safeParse({ ...mentor, references: ["www.example.com/profile", "https://www.example.com/profile"] }).success);
});

test("Mentor form keeps errors next to submit, preserves failed drafts and normalizes successful retries", async () => {
  for (const locale of ["en", "zh-tw"]) {
    const draft = { ...mentor, references: "https://example.com\nhttps://example.com/profile\nnot a URL", consent: true };
    const slots: unknown[] = [draft, ""], storage = new Map<string, string>();
    let cursor = 0, accepted = false;
    const submitted: Array<{ draft: { references: string[] } }> = [];
    const load = pdfRuntime({ react: { ...React, useEffect() {}, useRef: () => ({ current: null }), useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: unknown) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    } }, "next-intl": { useLocale: () => locale } }, { localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
    const { MentorForm } = load<typeof import("../src/components/dashboard/roundtables/Forms")>("src/components/dashboard/roundtables/Forms.tsx");
    const props = { userId: "mentor-qa", cert: null, disabled: false, error: "HTTP 503\nRequest failed\nreference-qa", notice: "", write: async (input: unknown) => { submitted.push(input as typeof submitted[number]); return accepted; } };
    const render = () => { cursor = 0; return MentorForm(props) as React.ReactElement<{ onSubmit(e: { preventDefault(): void }): void | Promise<void> }>; };
    await render().props.onSubmit({ preventDefault() {} });
    assert.equal(submitted.length, 0);
    const invalid = renderToStaticMarkup(render());
    assert.match(invalid, locale === "en" ? /Evidence URLs.*line 3/ : /佐證網址.*第 3 行/);
    assert(invalid.indexOf('role="alert"') > invalid.indexOf("</button>"));
    assert.deepEqual(slots[0], draft);
    slots[0] = { ...draft, references: "www.linkedin.com/in/qa-mentor" };
    await render().props.onSubmit({ preventDefault() {} });
    assert.equal(submitted.length, 1);
    assert.deepEqual(Array.from(submitted[0].draft.references), ["https://www.linkedin.com/in/qa-mentor"]);
    assert.equal((slots[0] as typeof draft).references, "www.linkedin.com/in/qa-mentor");
    const failed = renderToStaticMarkup(render());
    assert.match(failed, /HTTP 503/); assert.match(failed, /reference-qa/);
    accepted = true; props.error = "";
    await render().props.onSubmit({ preventDefault() {} });
    assert.equal((slots[0] as typeof draft).references, "https://www.linkedin.com/in/qa-mentor");
    assert.equal(storage.size, 0);
  }
});
test("Mentor drafts keep their version across reload and require explicit latest-record comparison", async () => {
  for (const revision of [undefined, 1]) {
    const draft={...mentor,references:mentor.references.join("\n"),consent:true,...(revision===undefined?{}:{revision})},slots: unknown[]=[draft, ""],saved: unknown[]=[];
    let cursor=0;
    const load=pdfRuntime({react:{...React,useEffect(){},useRef:()=>({current:null}),useState(initial:unknown){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],(value:unknown)=>{slots[i]=value;}];}},"next-intl":{useLocale:()=>"en"}},{localStorage:{getItem:()=>null,setItem(){},removeItem(){}}});
    const {MentorForm}=load<typeof import("../src/components/dashboard/roundtables/Forms")>("src/components/dashboard/roundtables/Forms.tsx");
    const props={userId:"owner",cert:{status:"pending",revision:2,draft:{...mentor,bio:"Newest server biography, preserved during comparison."},note:"Review updated"},disabled:false,write:async(input:unknown)=>{saved.push(input);return false;}};
    const render=()=>{cursor=0;return MentorForm(props) as React.ReactElement<{onSubmit(e:{preventDefault():void}):Promise<void>}>;};
    await render().props.onSubmit({preventDefault(){}});assert.equal(saved.length,0);assert.deepEqual(slots[0],draft);
    const html=renderToStaticMarkup(render());assert.match(html,/Newest server biography/);assert.match(html,/Compare before retrying/);
    function find(node:React.ReactNode):React.ReactElement<{onClick():void}>|undefined{let found:React.ReactElement<{onClick():void}>|undefined;React.Children.forEach(node,child=>{if(!React.isValidElement<{children?:React.ReactNode;onClick():void}>(child))return;if(child.type==="button"&&child.props.children==="Compared; use latest version to retry")found=child;else found=found||find(child.props.children);});return found;}
    find(render())!.props.onClick();assert.equal((slots[0] as typeof draft).bio,draft.bio);await render().props.onSubmit({preventDefault(){}});
    assert.equal(saved.length,1);assert.equal((saved[0] as {revision:number}).revision,2);
  }
});

test("Roundtable boundaries reject forged certifications, capacity outside 4–6, unsafe links and unconsented applications", () => {
  assert(!mentorDraftSchema.safeParse({ ...mentor, status: "approved" }).success);
  assert(!mentorDraftSchema.safeParse({ ...mentor, references: ["javascript:alert(1)"] }).success);
  assert(!roundtableMutationSchema.safeParse({ action: "apply", id: "r", name: "QA", question: "Discuss evidence", consent: false }).success);
  assert(!roundtableMutationSchema.safeParse({ action: "apply", id: "r", name: "QA", question: "Discuss evidence", consent: true, status: "confirmed" }).success);
  const draft = { topic: "QA roundtable", description: "Discuss actual customer evidence", steps: ["01-1"], industry: "saas", languages: ["en"], startsAt: "2026-11-06T02:00:00Z", endsAt: "2026-11-06T03:00:00Z", timezone: "Asia/Taipei", capacity: 4, registrationMode: "instant", meetingUrl: "https://meet.google.com/qa-private-room" };
  assert(sessionDraftSchema.safeParse(draft).success);
  for (const patch of [{ capacity: 3 }, { capacity: 7 }, { timezone: "Moon/Base" }, { steps: ["01-1", "01-1"] }, { endsAt: "2026-11-06T02:05:00Z" }, { meetingUrl: "https://user:password@example.com/" }]) assert(!sessionDraftSchema.safeParse({ ...draft, ...patch }).success);
});
test("Roundtables in isolated PostgreSQL: certification, concurrent seats, approved FIFO, privacy, immutable sources and atomic commitments", { skip: !process.env.ROLL_REWARDS_TEST_DATABASE_URL }, async t => {
  const connectionString = process.env.ROLL_REWARDS_TEST_DATABASE_URL!, url = new URL(connectionString);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/roll_rewards_qa"));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 12 }) });
  const users: string[] = [], sessions: string[] = [];
  let now = Date.parse("2026-11-05T04:00:00Z"), failNotice = false;
  class Clock extends Date { constructor(value?: string | number | Date) { super(value === undefined ? now : value instanceof Date ? value.getTime() : value); } static now() { return now; } }
  const mocks: Record<string, unknown> = {
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/network/access": { networkAccount: async (userId: string, tx = db) => { const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { matchmakingProfile: true } }); return { ...u, effectivePlan: u.plan }; }, features: async (userId: string, tx = db) => ({ network: (await tx.user.findUniqueOrThrow({ where: { id: userId } })).plan === "business" }) },
    "@/lib/network/notifications": { queueNotification: async (tx: typeof db, userId: string, eventKey: string, kind: string, payload: object, email = false) => { assert.equal(email, false); if (failNotice) throw new Error("Injected notification failure"); return tx.memberNotification.upsert({ where: { eventKey }, create: { userId, eventKey, kind, payload }, update: {} }); } },
  };
  const cache = new Map<string, { exports: unknown }>(), req = createRequire(import.meta.url);
  function load<T>(file: string): T {
    const full = resolve(file), found = cache.get(full); if (found) return found.exports as T;
    const result = { exports: {} }; cache.set(full, result);
    runInNewContext(ts.transpileModule(readFileSync(full, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, {
      module: result, exports: result.exports, Date: Clock, Intl, URL, Response, Headers, Buffer, console, process: { env: {} },
      require: (id: string) => { if (id in mocks) return mocks[id]; if (id.startsWith("@/") || id.startsWith(".")) { const base = id.startsWith("@/") ? resolve("src", id.slice(2)) : resolve(dirname(full), id); const path = [base + ".ts", base + "/index.ts"].find(existsSync); if (path) return load(path); } return req(id); },
    });
    return result.exports as T;
  }
  const service = load<typeof import("../src/lib/roundtables/service")>("src/lib/roundtables/service.ts");
  async function user(role = "founder", plan = "business") {
    const r = await db.user.create({ data: { email: randomUUID() + "@roundtable.invalid", plan, matchmakingProfile: { create: { role, categories: ["mentorship"], country: "TW", industry: "saas", slogan: "QA", offers: "QA experience", looksFor: "QA", visibleFields: [], visible: true, verified: role === "investor" } } } }); users.push(r.id); return r;
  }
  const host = await user("investor"), otherHost = await user("mentor"), members = await Promise.all(Array.from({ length: 10 }, () => user())), outsider = await user(), free = await user("founder", "free");
  const beforeHost = JSON.stringify(await db.user.findUnique({ where: { id: host.id }, include: { matchmakingProfile: true } }));
  const legacy = await db.actionPlan.create({ data: { userId: host.id, activeKey: host.id, requestId: randomUUID(), locale: "en", companyStage: "MVP", stageReason: "Preserved", stageConfidence: 70, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "Preserved", bottleneckConfidence: 60 } });
  const legacyBefore = JSON.stringify(await db.actionPlan.findUnique({ where: { id: legacy.id } }));
  const run = (userId: string, input: unknown) => service.mutateRoundtable(userId, roundtableMutationSchema.parse(input));
  const draft = (day = 6, mode = "instant") => sessionDraftSchema.parse({ topic: "QA customer evidence " + day, description: "Discuss customer evidence and next measurable action.", steps: ["01-1", "01-2"], industry: "saas", languages: ["en", "zh-tw"], startsAt: "2026-11-" + String(day).padStart(2, "0") + "T02:00:00Z", endsAt: "2026-11-" + String(day).padStart(2, "0") + "T03:00:00Z", timezone: "Asia/Taipei", capacity: 4, registrationMode: mode, meetingUrl: "https://meet.google.com/qa-private-room-" + day });
  const create = async (who: string, day: number, mode = "instant") => { const id = (await run(who, { action: "create", requestId: randomUUID(), draft: draft(day, mode) }))!; sessions.push(id); return id; };
  const apply = (who: string, id: string) => run(who, { action: "apply", id, name: "QA " + who.slice(-5), question: "Private question for host " + who, consent: true });
  const session = async (id: string) => db.roundtable.findUniqueOrThrow({ where: { id }, include: { registrations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
  async function certify(who: string) {
    await run(who, { action: "mentorApply", revision: 0, draft: mentor, consent: true });
    const cert = await db.mentorCertification.findUniqueOrThrow({ where: { userId: who } });
    await service.reviewMentor("reviewer@qa.invalid", { id: cert.id, revision: cert.revision, status: "approved", note: "Verified professional references and mentoring experience." });
  }
  let instant = "", approval = "", completedEntries: Extract<RoundtableMutation, { action: "finish" }>["entries"] = [];
  try {
    await t.test("Member roles and verified investors cannot self-certify; admin self-review and stale approvals fail", async () => {
      await assert.rejects(create(host.id, 6), /certification/);
      await run(host.id, { action: "mentorApply", revision: 0, draft: mentor, consent: true });
      await run(host.id, { action: "mentorApply", revision: 0, draft: mentor, consent: true });
      const cert = await db.mentorCertification.findUniqueOrThrow({ where: { userId: host.id } });
      assert.equal((cert.history as unknown[]).length, 1);
      await assert.rejects(service.reviewMentor(host.email, { id: cert.id, revision: 1, status: "approved", note: "Own review" }), /own/);
      const race = await Promise.allSettled(Array.from({ length: 2 }, () => service.reviewMentor("reviewer@qa.invalid", { id: cert.id, revision: 1, status: "approved", note: "Professional references verified" })));
      assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
      await assert.rejects(run(host.id, { action: "mentorApply", revision: 2, draft: { ...mentor, publicName: "Unreviewed name" }, consent: true }), /overwritten/);
      await certify(otherHost.id);
      assert.equal(JSON.stringify(await db.user.findUnique({ where: { id: host.id }, include: { matchmakingProfile: true } })), beforeHost, "Certification cannot change investor verification, roles or plans");
    });
    await t.test("Host creation is idempotent and rejects overlaps, changed retries and past starts", async () => {
      const input = { action: "create", requestId: randomUUID(), draft: draft() };
      instant = (await run(host.id, input))!; sessions.push(instant);
      assert.equal(await run(host.id, input), instant);
      await assert.rejects(run(host.id, { ...input, draft: { ...input.draft, topic: "Different request" } }), /changed/);
      await assert.rejects(create(host.id, 6), /overlap/);
      await assert.rejects(run(host.id, { action: "create", requestId: randomUUID(), draft: { ...draft(), startsAt: "2026-11-01T02:00:00Z", endsAt: "2026-11-01T03:00:00Z" } }), /future/);
      approval = await create(host.id, 7, "approval");
    });
    await t.test("Only founders with existing eligibility apply; private references and links never reach strangers", async () => {
      await assert.rejects(apply(free.id, instant), /eligible/);
      await assert.rejects(apply(host.id, instant), /reserved/);
      await assert.rejects(apply(otherHost.id, instant), /Founder/);
      const view = await service.getRoundtables(outsider.id, instant), row = view.sessions.find(r => r.id === instant)!;
      assert.equal(row.meetingUrl, null); assert.equal(row.people.length, 0);
      assert(!JSON.stringify(view).includes("private-reference"));
    });
    await t.test("Ten concurrent applications confirm exactly three seats plus host, preserving one registration per member", async () => {
      await Promise.all(members.map(m => apply(m.id, instant)));
      let row = await session(instant);
      assert.equal(row.registrations.filter(r => r.status === "confirmed").length, 3);
      assert.equal(row.registrations.filter(r => r.status === "waitlisted").length, 7);
      await Promise.all(members.map(m => apply(m.id, instant)));
      row = await session(instant); assert.equal(row.registrations.length, 10);
      const accepted = row.registrations.find(r => r.status === "confirmed")!;
      const peer = (await service.getRoundtables(accepted.userId, instant)).sessions.find(r => r.id === instant)!;
      assert.equal(peer.people.length, 3); assert(peer.meetingUrl);
      assert(!JSON.stringify(peer).includes("Private question for host " + members.find(m => m.id !== accepted.userId)!.id));
      assert.equal((await service.getRoundtables(host.id, instant)).sessions.find(r => r.id === instant)!.people.length, 10);
    });
    await t.test("Cancellation and approval run under the same seat lock; approved FIFO cannot be jumped", async () => {
      const row = await session(instant), seat = row.registrations.find(r => r.status === "confirmed")!, next = row.registrations.find(r => r.status === "waitlisted")!;
      await Promise.all([run(seat.userId, { action: "withdraw", id: instant }), run(seat.userId, { action: "withdraw", id: instant })]);
      const updated = await session(instant); assert.equal(updated.registrations.find(r => r.id === next.id)!.status, "confirmed"); assert.equal(updated.registrations.filter(r => r.status === "confirmed").length, 3);
      assert.equal(await db.memberNotification.count({ where: { userId: next.userId, eventKey: { contains: "seat:" + next.id } } }), 1);
      await Promise.all(members.slice(0, 5).map(m => apply(m.id, approval)));
      const applicants = (await session(approval)).registrations;
      for (const r of applicants.slice(0, 3)) { const current = await session(approval); await run(host.id, { action: "decide", id: approval, revision: current.revision, registrationId: r.id, decision: "approve", reason: "Relevant customer evidence" }); }
      await apply(members[5].id, approval);
      const current = await session(approval), waiting = current.registrations.find(r => r.userId === members[5].id)!;
      assert.equal(waiting.status, "waitlisted"); assert.equal(waiting.approvedAt, null);
      await run(applicants[0].userId, { action: "withdraw", id: approval });
      assert.equal((await session(approval)).registrations.filter(r => r.status === "confirmed").length, 2, "Unreviewed waiting applicants cannot fill a seat");
      let fresh = await session(approval);
      await run(host.id, { action: "decide", id: approval, revision: fresh.revision, registrationId: waiting.id, decision: "approve", reason: "References are relevant" });
      fresh = await session(approval); assert.equal(fresh.registrations.find(r => r.id === waiting.id)!.status, "confirmed");
      await assert.rejects(run(host.id, { action: "decide", id: approval, revision: 0, registrationId: waiting.id, decision: "reject", reason: "Stale decision" }), /changed/);
    });
    await t.test("Promotion rechecks eligibility; blocking the host prevents applications and private access", async () => {
      const row = await session(instant), waiting = row.registrations.find(r => r.status === "waitlisted")!, seat = row.registrations.find(r => r.status === "confirmed")!;
      await db.user.update({ where: { id: waiting.userId }, data: { plan: "free" } });
      await run(seat.userId, { action: "withdraw", id: instant });
      const next = await session(instant);
      assert.equal(next.registrations.find(r => r.id === waiting.id)!.status, "rejected");
      assert.equal(next.registrations.filter(r => r.status === "confirmed").length, 3);
      await db.networkConnection.create({ data: { pairKey: [host.id, outsider.id].sort().join(":"), senderId: host.id, recipientId: outsider.id, status: "blocked" } });
      await assert.rejects(apply(outsider.id, instant), /unavailable/);
      const view = (await service.getRoundtables(outsider.id, instant)).sessions.find(r => r.id === instant)!;
      assert.equal(view.meetingUrl, null); assert.equal(view.mentor.bio, ""); assert.equal(view.people.length, 0);
    });
    await t.test("Other mentors cannot manage sessions; registered topics/time freeze; only hosts can change private meeting links", async () => {
      const row = await session(instant);
      await assert.rejects(run(otherHost.id, { action: "cancel", id: instant, revision: row.revision, reason: "Not my session" }), /Only the host/);
      await assert.rejects(run(host.id, { action: "edit", id: instant, revision: row.revision, draft: draft(8) }), /Applications exist/);
      await run(host.id, { action: "meetingLink", id: instant, revision: row.revision, meetingUrl: "https://meet.google.com/replaced-private-room" });
      assert.equal((await service.getRoundtables(outsider.id, instant)).sessions.find(r => r.id === instant)!.meetingUrl, null);
    });
    await t.test("Registration closes at start; only confirmed members can have outcomes and absentees get no task", async () => {
      now = Date.parse("2026-11-06T02:00:00Z");
      await assert.rejects(apply(outsider.id, instant), /closed/);
      await assert.rejects(run(members[0].id, { action: "withdraw", id: instant }), /closed/);
      const row = await session(instant);
      completedEntries = row.registrations.filter(r => r.status === "confirmed").map((r, i) => ({ registrationId: r.id, attendance: i === 2 ? "absent" : "attended", ...(i === 2 ? {} : { commitment: { title: "Interview three target buyers", criteria: "Save three actual customer conversations and compare pain severity", dueDate: "2026-11-10" } }) }));
      await assert.rejects(run(host.id, { action: "finish", id: instant, revision: row.revision, entries: completedEntries }), /after the session/);
      now = Date.parse("2026-11-06T03:01:00Z");
      await assert.rejects(run(host.id, { action: "finish", id: instant, revision: row.revision, entries: completedEntries.slice(1) }), /every confirmed/);
      await assert.rejects(run(host.id, { action: "finish", id: instant, revision: row.revision, entries: completedEntries.map(r => ({ ...r, attendance: "absent" })) }), /absentees/);
    });
    await t.test("Finalization rolls back every task, attendance and notification together; retries cannot duplicate commitments", async () => {
      const row = await session(instant), input = { action: "finish", id: instant, revision: row.revision, entries: completedEntries };
      failNotice = true;
      await assert.rejects(run(host.id, input), /Injected/);
      assert.equal(await db.weekCalendarItem.count({ where: { requestId: { startsWith: "roundtable:" + instant } } }), 0);
      assert((await session(instant)).registrations.every(r => r.attendance === "unknown"));
      assert.equal((await session(instant)).status, "scheduled"); failNotice = false;
      await run(host.id, input);
      await run(host.id, { ...input, entries: [...completedEntries].reverse() });
      assert.equal(await db.weekCalendarItem.count({ where: { requestId: { startsWith: "roundtable:" + instant } } }), 2);
      await assert.rejects(run(host.id, { ...input, entries: [] }), /changed/);
      assert.equal((await service.getRoundtables(outsider.id, instant)).sessions.find(r => r.id === instant)!.people.length, 0);
    });
    await t.test("Commitments remain owned, versioned and available after expiry or calendar removal; no task gates or rewards change", async () => {
      const reg = (await session(instant)).registrations.find(r => r.attendance === "attended")!;
      let owned = await service.myCommitments(reg.userId); assert.equal(owned.length, 1);
      await assert.rejects(run(outsider.id, { action: "commitmentDone", registrationId: reg.id, revision: owned[0].revision, done: true }), /not found/);
      await db.user.update({ where: { id: reg.userId }, data: { plan: "free" } });
      await run(reg.userId, { action: "commitmentDone", registrationId: reg.id, revision: owned[0].revision, done: true });
      await assert.rejects(run(reg.userId, { action: "commitmentDone", registrationId: reg.id, revision: owned[0].revision, done: false }), /changed/);
      await db.weekCalendarItem.update({ where: { id: reg.calendarItemId! }, data: { deletedAt: new Date() } });
      owned = await service.myCommitments(reg.userId); assert(owned[0].done && owned[0].calendarRemoved);
      assert.equal(await db.rewardEntry.count({ where: { userId: { in: users } } }), 0);
      assert.equal(JSON.stringify(await db.actionPlan.findUnique({ where: { id: legacy.id } })), legacyBefore);
      assert.equal(await db.memberNotificationDelivery.count({ where: { notification: { userId: { in: users } } } }), 0);
    });
    await t.test("Revoking certification cancels unfinished sessions and blocks further hosting, preserving completed outcomes and member data", async () => {
      const cert = await db.mentorCertification.findUniqueOrThrow({ where: { userId: host.id } });
      await service.reviewMentor("reviewer@qa.invalid", { id: cert.id, revision: cert.revision, status: "revoked", note: "Professional status requires renewed verification" });
      assert.equal((await session(approval)).status, "cancelled");
      assert.equal((await session(instant)).status, "completed");
      await assert.rejects(create(host.id, 9), /certification/);
      await assert.rejects(apply(outsider.id, approval), /closed/);
      assert.equal(JSON.stringify(await db.user.findUnique({ where: { id: host.id }, include: { matchmakingProfile: true } })), beforeHost);
      const queue = await service.mentorQueue(); assert.equal(queue.find(r => r.userId === host.id)!.status, "revoked");
      await run(host.id, { action: "mentorApply", revision: cert.revision + 1, draft: { ...mentor, bio: "PRIVATE pending revision that has not been approved for public display." }, consent: true });
      const publicView = await service.getRoundtables(outsider.id, instant);
      assert(!JSON.stringify(publicView).includes("PRIVATE pending revision"), "Unreviewed resubmissions cannot replace public host bios on historical sessions");

    });
    await t.test("Deleting a future host cancels its public session and cannot promote more waiters", async () => {
      const id = await create(otherHost.id, 9);
      const active = [];
      for (const m of members) if ((await db.user.findUniqueOrThrow({ where: { id: m.id } })).plan === "business") active.push(m);
      for (const m of active.slice(0, 4)) await apply(m.id, id);
      const before = await session(id), confirmed = before.registrations.find(r => r.status === "confirmed")!, waiting = before.registrations.find(r => r.status === "waitlisted")!;
      await db.user.delete({ where: { id: otherHost.id } });
      assert.equal((await service.getRoundtables(waiting.userId, id)).sessions.find(s => s.id === id)!.status, "cancelled");
      await run(confirmed.userId, { action: "withdraw", id });
      assert.equal((await session(id)).registrations.find(r => r.id === waiting.id)!.status, "waitlisted");
    });
    await t.test("Host account deletion removes its private application but retains other members' sessions and commitments", async () => {
      const count = await db.roundtableRegistration.count({ where: { roundtableId: instant } });
      await db.user.delete({ where: { id: host.id } });
      assert.equal((await session(instant)).hostId, null);
      assert.equal(await db.roundtableRegistration.count({ where: { roundtableId: instant } }), count);
      assert.equal(await db.weekCalendarItem.count({ where: { requestId: { startsWith: "roundtable:" + instant } } }), 2);
      assert(!JSON.stringify(await service.getRoundtables(outsider.id, instant)).includes("private-reference"));
    });
  } finally {
    await db.roundtable.deleteMany({ where: { id: { in: sessions } } });
    await db.user.deleteMany({ where: { id: { in: users }, email: { endsWith: "@roundtable.invalid" } } });
    await db.$disconnect();
  }
});

test("Roundtable step labels stay readable in both languages without changing selected IDs", async () => {
  for (const locale of ["en", "zh-tw"]) {
    const slots: unknown[] = [], submitted: Array<{ draft: { steps: string[] } }> = [];
    let cursor = 0;
    const load = pdfRuntime({ react: { ...React, useEffect() {}, useRef: () => ({ current: false }), useState(initial: unknown) {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value: unknown) => { slots[i] = value; }];
    } }, "next-intl": { useLocale: () => locale } }, { localStorage: { setItem() {}, removeItem() {} }, crypto: { randomUUID } });
    const { SessionForm } = load<typeof import("../src/components/dashboard/roundtables/Forms")>("src/components/dashboard/roundtables/Forms.tsx");
    const render = () => { cursor = 0; return SessionForm({ userId: "short-step-labels", disabled: false, write: async input => { submitted.push(input as typeof submitted[number]); return false; } }); };
    const first = renderToStaticMarkup(render()), firstSummary = first.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)![1]!;
    assert.match(firstSummary, locale === "en" ? /01-1 Customer conversations/ : /01-1 客戶訪談/);
    const chosen = ["01-1", "02-2", "05-3"];
    slots[0] = { ...slots[0] as object, steps: chosen };
    const form = render(), html = renderToStaticMarkup(form), details = html.match(/<details[^>]*>([\s\S]*?)<\/details>/)![1]!, summary = details.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)![1]!;
    assert.match(summary, locale === "en" ? /02-2 Payment evidence/ : /02-2 付款證據/);
    assert.match(summary, locale === "en" ? /05-3 Market validation report/ : /05-3 市場驗證報告/);
    assert.equal((details.match(/type="checkbox"/g) || []).length, 16);
    assert.equal((details.match(/checked=""/g) || []).length, chosen.length);
    assert.doesNotMatch(details, /Talk with 10 target|Write a positioning statement|與 10 位目標客戶對話|寫出一句話定位/);
    form.props.onSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>);
    await Promise.resolve();
    assert.deepEqual(submitted[0]!.draft.steps, chosen);
  }
});
