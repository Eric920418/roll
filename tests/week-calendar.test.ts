import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { calendarDate, calendarWeekStart, calendarWeek, addCalendarDays, weekMutationSchema } from "../src/lib/week-plan/schema";

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
