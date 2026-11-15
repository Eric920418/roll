import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pdfRuntime } from "./helpers/pdf-runtime";
import type { RoundtableState } from "../src/lib/roundtables/service";

function fixture() {
  const session = { id: "next", topic: "Review actual customer evidence", description: "Saved session", startsAt: "2026-11-18T12:00:00Z", endsAt: "2026-11-18T13:00:00Z", timezone: "Asia/Taipei", status: "scheduled", host: false, mentor: { name: "Saved mentor", certified: true }, hostProfile: { company: "Public host company", country: "TW" }, prepared: 1, confirmed: 3, capacity: 5, meetingUrl: "https://meet.google.com/saved-room", mine: { id: "mine", revision: 2, status: "confirmed", question: "How can we validate this offer?", preparation: { conversations: 1, findings: 1, share: false, submittedAt: "2026-11-15T00:00:00Z" } }, people: [{ id: "mine", name: "Saved member", status: "confirmed", mine: true, profile: { company: "Public company", country: "TW" }, preparation: null }, { id: "peer", name: "Consenting peer", status: "confirmed", mine: false, profile: null, preparation: { stage: 3, conversations: 2, totalConversations: 12, share: true, submittedAt: "2026-11-15T00:00:00Z" } }] };
  const data = { serverTime: "2026-11-15T00:00:00Z", sessions: [session], evidence: { week: "2026-11-09", stage: 2, conversations: 1, totalConversations: 4, findings: 1, commitments: 0 }, commitments: [{ id: "last", session: "prior", title: "Actual prior commitment", at: "2026-11-04T13:00:00Z", done: false }, { id: "older", session: "old", title: "Older commitment", at: "2026-10-01T13:00:00Z", done: true }, { id: "later", session: "future", title: "Future commitment", at: "2026-12-01T13:00:00Z", done: false }] };
  return { session, data };
}
const hooks = { ...React, useEffect() {}, useState: (value: unknown) => [value, () => {}], useRef: (value: unknown) => ({ current: value }) };

test("Roundtable overview follows the reference order using actual counts, privacy and meeting time zone", () => {
  for (const locale of ["en", "zh-tw"]) {
    const { session, data } = fixture();
    const load = pdfRuntime({ react: hooks, "next-intl": { useLocale: () => locale }, "next/link": { __esModule: true, default: "a" } });
    const Overview = load<typeof import("../src/components/dashboard/roundtables/Overview")>("src/components/dashboard/roundtables/Overview.tsx").default;
    const render = () => renderToStaticMarkup(React.createElement(Overview, { userId: "owner", session: session as unknown as RoundtableState["sessions"][number], data: data as unknown as RoundtableState, disabled: false, write: async () => true, headingRef: null }));
    const html = render();
    assert(html.includes('bg-[#0d0d0d]')); assert(html.includes("20:00")); assert(html.includes("21:00"));
    assert.match(html, /Join meeting|加入會議/); assert.match(html, /href="https:\/\/meet.google.com\/saved-room"/);
    const headings = ["roundtable-members-title", "roundtable-agenda-title", "roundtable-previous-title"].map(id => html.indexOf('id="' + id + '"'));
    assert(headings.every((value, i) => value >= 0 && (!i || value > headings[i - 1])));
    assert.match(html, /<table/); assert.match(html, /4 (?:conversations|次對話)/); assert.match(html, /12 (?:conversations|次對話)/);
    assert.match(html, locale === "en" ? /1 conversation · 1 pain point/ : /1 次對話 · 1 項痛點/);
    assert.equal((html.match(/✓ (?:Submitted|已提交)/g) || []).length, 3, "Own private submission remains visible to its owner");
    assert(html.includes("0–5")); assert(html.includes("5–55")); assert(html.includes("55–60"));
    assert(html.includes("Actual prior commitment")); assert(!html.includes("Older commitment")); assert(!html.includes("Future commitment"));
    assert.match(html, new RegExp(`href="${locale === "zh-tw" ? "/zh-tw" : ""}/dashboard/agenda#roundtable-commitments"`));
    session.endsAt = "2026-11-18T13:30:00Z"; assert(render().includes("85–90"));
    session.status = "cancelled"; assert(!render().includes('href="https://meet.google.com/saved-room"'));
  }
});

test("Unconfirmed and empty roundtables never invent people, private links or preparation counts", () => {
  const { session, data } = fixture();
  const load = pdfRuntime({ react: hooks, "next-intl": { useLocale: () => "en" }, "next/link": { __esModule: true, default: "a" } });
  const Overview = load<typeof import("../src/components/dashboard/roundtables/Overview")>("src/components/dashboard/roundtables/Overview.tsx").default;
  const props = { userId: "owner", data: { ...data, evidence: null, commitments: [] } as unknown as RoundtableState, disabled: false, write: async () => true, headingRef: null };
  const html = renderToStaticMarkup(React.createElement(Overview, { ...props, session: { ...session, mine: null, people: [], meetingUrl: null, hostProfile: null, prepared: null } as unknown as RoundtableState["sessions"][number] }));
  assert(!html.includes("Saved member")); assert(!html.includes("Consenting peer")); assert(!html.includes("saved-room"));
  assert(html.includes("Confirm a seat")); assert(!html.includes("Submit preparation")); assert(html.includes('href="#roundtable-registration"'));
  const empty = renderToStaticMarkup(React.createElement(Overview, props));
  assert(empty.includes("No sessions are scheduled")); assert(!empty.includes("20:00")); assert(!empty.includes("Saved mentor"));
  assert(empty.includes("roundtable-members-title")); assert(empty.includes("Suggested 60 minutes")); assert(empty.includes("roundtable-previous-title"));
});
