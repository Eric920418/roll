import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_GUESS, guessToIcp, discoveryInputSchema, validateDiscoveryResult } from "../src/lib/icp/discovery";
import { EMPTY_ICP } from "../src/lib/icp/schema";
import { emptyInsight, insightSchema, insightBody } from "../src/lib/customer-insights/schema";
const base = { message: "A starting hypothesis", question: "", candidates: [], guess: null, patterns: [], unclear: [] };
test("Discovery placeholders never become data and situations do not overwrite customer stage or location", () => {
  assert.equal(guessToIcp(EMPTY_GUESS).summary, "");
  const draft = guessToIcp({ ...EMPTY_GUESS, customer: "Founders", struggle: "No paying users", situation: "After launching an MVP" }, { ...EMPTY_ICP, stage: "Previously saved customer stage", location: "Previously saved customer location" });
  assert.equal(draft.stage, "Previously saved customer stage"); assert.equal(draft.location, "Previously saved customer location");
  assert.match(draft.summary, /After launching/);
});
test("Stage types, calendar dates and field lengths validate independently of company stage", () => {
  const data = { ...emptyInsight("discover"), name: "QA", date: "2026-02-28", answers: ["Actual answer", "", "", ""] };
  assert.equal(insightSchema.safeParse(data).success, true);
  assert.equal(insightSchema.safeParse({ ...data, date: "2026-02-30" }).success, false);
  assert.equal(insightSchema.safeParse({ ...data, type: "Angel" }).success, false);
  assert.match(insightBody(data), /How they solve it today: Actual answer/);
  assert.equal(insightSchema.safeParse({ ...data, companyStage: "MVP" }).success, false);
});
test("Suggestions accept Chinese names and reject duplicates or fewer than two candidates", () => {
  const candidate = { name: "小型軟體團隊的產品主管", whyFirst: "Can reach through founder groups", whereToFind: ["Founder groups"], reach: "easy", assumptionToTest: "Need prioritization", guess: { ...EMPTY_GUESS, customer: "產品主管" } };
  assert.throws(() => validateDiscoveryResult({ ...base, candidates: [candidate] }, "suggest"));
  assert.throws(() => validateDiscoveryResult({ ...base, candidates: [candidate, candidate] }, "suggest"));
  assert.equal(validateDiscoveryResult({ ...base, candidates: [candidate, { ...candidate, name: "小型顧問公司的負責人" }] }, "suggest").candidates.length, 2);
  assert.throws(() => validateDiscoveryResult({ ...base, candidates: [candidate, { ...candidate, name: "小型顧問公司的負責人" }] }, "suggest", [], [candidate.name]));
  assert.equal(validateDiscoveryResult({ ...base, question: "What does your product do?" }, "suggest").candidates.length, 0);
  assert.equal(discoveryInputSchema.safeParse({ mode: "suggest", product: "" }).success, false);
});
test("Conversation synthesis rejects fabricated evidence, foreign IDs and repeated source IDs", () => {
  const conversations = Array.from({ length: 5 }, (_, i) => ({ id: `owned-${i}`, body: "Actual customer quote" }));
  const pattern = { text: "A recurring problem", evidence: [{ id: "owned-0", quote: "Actual customer quote" }, { id: "owned-1", quote: "Actual customer quote" }] };
  const result = { ...base, guess: { ...EMPTY_GUESS, customer: "Founders" }, patterns: [pattern, { ...pattern, text: "Another problem" }] };
  assert.equal(validateDiscoveryResult(result, "synthesize", conversations).patterns.length, 2);
  assert.throws(() => validateDiscoveryResult(result, "synthesize", conversations.slice(0, 4)));
  for (const bad of [{ id: "foreign", quote: "Actual customer quote" }, { id: "owned-0", quote: "Invented quote" }, { id: "owned-0", quote: "Actual customer quote" }]) assert.throws(() => validateDiscoveryResult({ ...result, patterns: [{ ...pattern, evidence: [pattern.evidence[0], bad] }, pattern] }, "synthesize", conversations));
});

import { dependencySatisfied } from "../src/lib/action-plan/dependency";
import { stageOutcomeMet, uniqueStagePeople, stageOutcomeSchema } from "../src/lib/customer-insights/schema";
test("Quantity prerequisites resolve independently of completion without treating unknown progress as zero", () => {
  assert.equal(dependencySatisfied({ dependsOn: { done: true } }), true);
  assert.equal(dependencySatisfied({ minimumCurrent: 5, dependsOn: { done: false, metricCurrent: 5 } }), true);
  assert.equal(dependencySatisfied({ minimumCurrent: 5, dependsOn: { done: true, metricCurrent: 4 } }), false);
  assert.equal(dependencySatisfied({ minimumCurrent: 5, dependsOn: { done: true, metricCurrent: null } }), false);
  assert.equal(dependencySatisfied({ minimumCurrent: null, dependsOn: { done: false, metricCurrent: 10 } }), false);
});
test("Stage reward conditions require distinct relevant evidence and confirmed actual outcomes", () => {
  const note = { ...emptyInsight("discover"), name: "Alice", company: "Acme", answers: ["A real observation", "", "", ""] };
  assert.equal(uniqueStagePeople("discover", [note, { ...note, name: "ALICE" }, { ...note, name: "Mentor", type: "Mentor" }, { ...note, name: "Empty", answers: ["", "", "", ""] }]), 1);
  const outcome = stageOutcomeSchema.parse({ stage: "discover", primaryCount: 10, secondaryCount: 3, note: "Three people described the same problem", confirmed: true });
  assert.equal(stageOutcomeMet(outcome, 9), false); assert.equal(stageOutcomeMet(outcome, 10), true);
  assert.equal(stageOutcomeMet({ ...outcome, stage: "mvp", primaryCount: 5, secondaryCount: 2 }, 5), false);
  assert.equal(stageOutcomeMet({ ...outcome, stage: "mvp", primaryCount: 5, secondaryCount: 3 }, 5), true);
  assert.equal(stageOutcomeMet({ ...outcome, stage: "first_sales", primaryCount: 3 }, 2), false);
  assert.equal(stageOutcomeMet({ ...outcome, stage: "angel_round" }, 19), false);
  assert.equal(stageOutcomeMet({ ...outcome, stage: "angel_round" }, 20), true);
});
