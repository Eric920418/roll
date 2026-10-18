import test from "node:test";
import assert from "node:assert/strict";
import { newDiscoveryTrial, discoveryEvidence, groundedDiscoveryAnalysis, founderAccessEndsAt } from "../src/lib/discovery/policy";
import { emptyInsight } from "../src/lib/customer-insights/schema";

test("New discovery policy is opt-in at signup only; leap-year access lasts twelve calendar months", () => {
  const saved = process.env.DISCOVERY_TRIAL_ENABLED;
  try {
    delete process.env.DISCOVERY_TRIAL_ENABLED; assert.deepEqual(newDiscoveryTrial(), {});
    process.env.DISCOVERY_TRIAL_ENABLED = "true";
    const now = new Date("2026-10-16T01:00:00Z"), trial = newDiscoveryTrial(now);
    assert.equal(trial.trialPolicy, "interviews-3-v1"); assert.equal(trial.trialEndsAt!.getTime() - now.getTime(), 14 * 86400000);
    assert.equal(founderAccessEndsAt(new Date("2028-02-29T01:00:00Z")).toISOString(), "2029-02-28T01:00:00.000Z");
  } finally { if (saved === undefined) delete process.env.DISCOVERY_TRIAL_ENABLED; else process.env.DISCOVERY_TRIAL_ENABLED = saved; }
});

test("Discovery preview deduplicates companies and verifies every quote before claiming repeated pain", () => {
  const note = (id: string, company: string, updatedAt: string, text = "Finding the right buyer takes too long") => ({ id, updatedAt, insight: { ...emptyInsight("discover"), journeyId: "owned", company, name: "Founder", notes: text } });
  const evidence = discoveryEvidence("owned", [note("old", " ACME  AI ", "2026-10-13"), note("new", "ＡＣＭＥ AI", "2026-10-14"), note("b", "Beta", "2026-10-14"), note("c", "Gamma", "2026-10-14", "Price is too high"), { ...note("foreign", "Other", "2026-10-15"), insight: { ...emptyInsight("discover"), journeyId: "other", name: "Other", company: "Other", notes: "Private data" } }]);
  assert.equal(evidence.length, 3); assert(!evidence.some(value => value.id === "old" || value.id === "foreign"));
  const input = { topics: [{ label: "Buyer targeting takes too long", evidence: [{ recordId: "new", quote: "right buyer takes too long" }, { recordId: "b", quote: "right buyer takes too long" }] }, { label: "Price", evidence: [{ recordId: "c", quote: "Price is too high" }] }], nextMoves: ["Interview seven more companies"] };
  const preview = groundedDiscoveryAnalysis(input, evidence, false);
  assert.equal(preview.topics.length, 1); assert.equal(preview.topics[0].count, 2); assert.equal(preview.topics[0].percent, 66.7); assert.deepEqual(preview.nextMoves, []);
  assert.equal(groundedDiscoveryAnalysis({ topics: [input.topics[1]], nextMoves: [] }, evidence, false).topics.length, 0);
  assert.equal(groundedDiscoveryAnalysis(input, evidence, true).topics.length, 2);
  assert.throws(() => groundedDiscoveryAnalysis({ topics: [{ label: "Invented", evidence: [{ recordId: "foreign", quote: "Private data" }] }], nextMoves: [] }, evidence, false));
  assert.throws(() => groundedDiscoveryAnalysis({ topics: [{ label: "Invented", evidence: [{ recordId: "new", quote: "A fabricated outcome" }] }], nextMoves: [] }, evidence, false));
});
