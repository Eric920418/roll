import assert from "node:assert/strict";
import test from "node:test";
import { completeRewardProfile, nextReminderAt, rewardKeys, validQuizAnswers, validReminderTime, validTimeZone } from "../src/lib/rewards/policy";
import en from "../messages/en.json";
import zh from "../messages/zh-tw.json";

test("Reward calendar changes at Taipei midnight/month boundary, independently of notification timezone", () => {
  assert.deepEqual(rewardKeys(new Date("2026-09-30T15:59:59Z")), { day: "2026-09-30", month: "2026-09" });
  assert.deepEqual(rewardKeys(new Date("2026-09-30T16:00:00Z")), { day: "2026-10-01", month: "2026-10" });
});
test("Profile reward requires all six nonempty fields; partial or whitespace data cannot earn", () => {
  const profile = { companyName: "NOVA", industry: "SaaS", country: "Taiwan", oneLinePitch: "Founder tools", companyStage: "MVP", primaryNeed: "product-validation" };
  assert(completeRewardProfile(profile));
  for (const key of Object.keys(profile)) assert(!completeRewardProfile({ ...profile, [key]: "  " }));
  assert(!completeRewardProfile(null));
});
test("Quiz reward rejects missing, duplicate, foreign, fractional and out-of-range answers", () => {
  const selected = [{ id: "one", options: [1,2] }, { id: "two", options: [1,2] }];
  assert(validQuizAnswers(selected, [{ questionId: "one", choice: 0 }, { questionId: "two", choice: 1 }]));
  for (const answers of [[], [{ questionId: "one", choice: 0 }], [{ questionId: "one", choice: 0 },{ questionId: "one", choice: 1 }], [{ questionId: "one", choice: -1 },{ questionId: "two", choice: 0 }], [{ questionId: "one", choice: 0.5 },{ questionId: "two", choice: 0 }], [{ questionId: "one", choice: 2 },{ questionId: "two", choice: 0 }], [{ questionId: "unknown", choice: 0 },{ questionId: "two", choice: 0 }]]) assert(!validQuizAnswers(selected, answers));
});
test("Reminder schedule supports local time, quarter-hour offsets and DST spring gaps/fall overlaps", () => {
  assert(validReminderTime("09:15")); assert(!validReminderTime("09:16")); assert(!validReminderTime("24:00"));
  assert(validTimeZone("Asia/Taipei")); assert(!validTimeZone("not/a/zone"));
  assert.equal(nextReminderAt("09:00", "Asia/Taipei", new Date("2026-10-03T00:30:00Z")).toISOString(), "2026-10-03T01:00:00.000Z");
  assert.equal(nextReminderAt("09:00", "Asia/Taipei", new Date("2026-10-03T01:01:00Z")).toISOString(), "2026-10-04T01:00:00.000Z");
  assert.equal(nextReminderAt("09:00", "Asia/Kathmandu", new Date("2026-10-03T00:00:00Z")).toISOString(), "2026-10-03T03:15:00.000Z");
  assert.equal(nextReminderAt("02:30", "America/New_York", new Date("2026-03-08T05:00:00Z")).toISOString(), "2026-03-08T07:00:00.000Z");
  const first = nextReminderAt("01:30", "America/New_York", new Date("2026-11-01T04:00:00Z"));
  assert.equal(first.toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(nextReminderAt("01:30", "America/New_York", first).toISOString(), "2026-11-02T06:30:00.000Z");
});
test("Reward translations expose matching behaviors and explicitly distinguish accepted from delivered", () => {
  assert.deepEqual(Object.keys(en.Rewards).sort(), Object.keys(zh.Rewards).sort());
  assert.match(en.Rewards.acceptedDetail, /does not confirm delivery/);
  assert.match(zh.Rewards.acceptedDetail, /不代表/);
});
