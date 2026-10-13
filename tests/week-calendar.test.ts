import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { calendarDate, calendarWeekStart, calendarWeek, addCalendarDays, weekMutationSchema, calendarTimes, calendarTime, interviewEnded, durationTimes, savedDuration, type CalendarEntry } from "../src/lib/week-plan/schema";

import { calendarIcs, googleCalendarUrl } from "../src/lib/week-plan/export";

test("Calendar uses Monday–Sunday in Taipei across UTC midnight and year boundaries", () => {
  assert.deepEqual(calendarWeek(new Date("2026-10-04T15:59:59Z")), { weekStart: "2026-09-28", today: "2026-10-04" });
  assert.deepEqual(calendarWeek(new Date("2026-10-04T16:00:00Z")), { weekStart: "2026-10-05", today: "2026-10-05" });
  assert.equal(calendarWeek(new Date("2026-01-01T12:00:00Z")).weekStart, "2025-12-29");
  assert.equal(addCalendarDays("2025-12-29", 6), "2026-01-04");
});
test("Calendar rejects nonexistent dates, non-Monday weeks, blank titles and caller-supplied ownership", () => {
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "not-a-date"]) assert(!calendarDate.safeParse(date).success);
  assert(calendarDate.safeParse("2028-02-29").success);
  assert(!calendarWeekStart.safeParse("2026-10-04").success);
  const item = { operation: "add", requestId: randomUUID(), title: "Meet founder", note: "", date: "2026-10-03" };
  assert(weekMutationSchema.safeParse(item).success);
  assert(!weekMutationSchema.safeParse({ ...item, title: "  " }).success);
  assert(!weekMutationSchema.safeParse({ ...item, userId: "someone-else" }).success);
});

test("Timed schedules validate paired times, Taipei date and overnight duration; legacy all-day requests remain valid", () => {
  const item = { operation: "add", requestId: randomUUID(), date: "2026-10-11", title: "Interview", note: "" };
  const times = calendarTimes(item.date, "23:00", "01:00");
  assert(weekMutationSchema.safeParse({ ...item, ...times }).success);
  assert.equal(calendarTime(times.endsAt), "01:00");
  assert.equal(times.endsAt, "2026-10-12T01:00:00+08:00");
  assert(weekMutationSchema.safeParse({ ...item, ...calendarTimes(item.date, "", "") }).success);
  for (const invalid of [
    { startsAt: times.startsAt }, { startsAt: "invalid", endsAt: times.endsAt }, { startsAt: times.startsAt, endsAt: "invalid" }, { startsAt: null, endsAt: times.endsAt },
    calendarTimes(item.date, "10:00", "10:00"), calendarTimes(item.date, "10:00", ""),
    { startsAt: "2026-10-11T20:00:00Z", endsAt: "2026-10-11T21:00:00Z" },
    { startsAt: times.startsAt, endsAt: "2026-10-13T01:00:00+08:00" },
  ]) assert(!weekMutationSchema.safeParse({ ...item, ...invalid }).success);
});
test("Log-it appears only for an available, unfinished interview after its actual end, never an all-day item", () => {
  const entry = { interview: true, available: true, done: false, endsAt: "2026-10-11T02:00:00Z" };
  const now = Date.parse(entry.endsAt);
  assert(!interviewEnded(entry, now - 1)); assert(interviewEnded(entry, now));
  for (const change of [{ interview: false }, { available: false }, { done: true }, { endsAt: null }]) assert(!interviewEnded({ ...entry, ...change }, now));
});
test("Calendar exports preserve local times and exclusive all-day ends, escape content and fold UTF-8 safely", () => {
  const entry: CalendarEntry = { id: "item_1", kind: "personal", date: "2026-10-11", startsAt: null, endsAt: null, title: "Company, A;B\\C", note: "Line 1\nBEGIN:VEVENT", done: false, revision: 0, actionId: null, available: true, interview: false, durationMinutes: null, alert: { enabled: false, status: null, acceptedAt: null, error: null } };
  const timed = { ...entry, id: "item_2", ...calendarTimes(entry.date, "23:00", "01:00"), title: "中文訪談".repeat(40) };
  const ics = calendarIcs([entry, timed, { ...entry, id: "blocked", available: false }], new Date("2026-10-11T00:00:00Z"));
  const unfolded = ics.replace(/\r\n /g, "");
  assert(unfolded.includes("DTSTART;VALUE=DATE:20261011\r\nDTEND;VALUE=DATE:20261012"));
  assert(unfolded.includes("DTSTART:20261011T150000Z\r\nDTEND:20261011T170000Z"));
  assert(unfolded.includes("DESCRIPTION:Line 1\\nBEGIN:VEVENT"));
  assert(unfolded.includes("SUMMARY:Company\\, A\\;B\\\\C"));
  assert(unfolded.includes(timed.title)); assert(!ics.includes("blocked@"));
  assert.equal(ics.match(/^BEGIN:VEVENT\r\n/gm)?.length, 2);
  for (const line of ics.split("\r\n")) assert(Buffer.byteLength(line, "utf8") <= 75);
  const google = new URL(googleCalendarUrl(timed));
  assert.equal(google.origin, "https://calendar.google.com");
  assert.equal(google.searchParams.get("dates"), "20261011T150000Z/20261011T170000Z");
  assert.equal(google.searchParams.get("text"), timed.title); assert.equal(google.searchParams.get("details"), entry.note);
  assert.equal(new URL(googleCalendarUrl(entry)).searchParams.get("dates"), "20261011/20261012");
});

test("Duration supports half-hour choices, overnight and 24-hour ends; old custom time ranges remain readable", () => {
  const half = durationTimes("2026-10-13", "23:45", 30);
  assert.equal(half.endsAt, "2026-10-13T16:15:00.000Z"); assert.equal(savedDuration({ ...half, durationMinutes: null }), 30);
  const full = durationTimes("2026-10-13", "09:00", 1440);
  assert.equal(full.endsAt, "2026-10-14T01:00:00.000Z");
  assert.deepEqual(durationTimes("2026-10-13", "", 120), { startsAt: null, endsAt: null });
  assert.equal(savedDuration({ startsAt: null, endsAt: null, durationMinutes: 120 }), 120);
  const item = { operation: "add", requestId: randomUUID(), date: "2026-10-13", title: "Task", note: "", ...half, durationMinutes: 30 };
  assert(weekMutationSchema.safeParse(item).success); assert(!weekMutationSchema.safeParse({ ...item, durationMinutes: 60 }).success);
});
