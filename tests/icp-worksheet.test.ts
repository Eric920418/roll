import test from "node:test";
import assert from "node:assert/strict";
import { evidenceStateSchema, evaluateEvidence } from "../src/lib/evidence/schema";
import {
  buildWorksheetCard, worksheetAnswerValid, worksheetAnswersSchema, worksheetCardSchema, worksheetKeys,
  worksheetNextAction, worksheetOptions, type WorksheetAnswers,
} from "../src/lib/icp/worksheet";

const selections: WorksheetAnswers = {
  type: { choices: ["b2b"], detail: "" },
  customer: { choices: ["startup", "small"], detail: "每月底做結算的營運主管" },
  buyer: { choices: ["manager"], detail: "" },
  problem: { choices: ["time"], detail: "月底手動合併三份試算表" },
  alternative: { choices: ["manual"], detail: "" },
  cost: { choices: ["unknown"], detail: "" },
  evidence: { choices: ["guess"], detail: "" },
};

test("Worksheet validates segment-specific answers, multiselect limits and other details", () => {
  assert(worksheetKeys.every(key => worksheetAnswerValid(key, selections)));
  const consumer = { ...selections, type: { choices: ["b2c"], detail: "" } };
  assert(worksheetOptions("customer", consumer).some(([id]) => id === "parents"));
  assert(!worksheetAnswerValid("customer", consumer));
  assert(!worksheetAnswerValid("customer", { ...selections, customer: { choices: ["small", "unknown"], detail: "" } }));
  assert(!worksheetAnswerValid("customer", { ...selections, customer: { choices: ["small", "small"], detail: "" } }));
  assert(!worksheetAnswerValid("buyer", { ...selections, buyer: { choices: ["other"], detail: " " } }));
  assert(!worksheetAnswerValid("evidence", {}));
  assert(!worksheetAnswersSchema.safeParse({ invented: selections.type }).success);
});

test("Worksheet uses concrete examples and keeps self-reported evidence separate from verified progress", () => {
  const card = buildWorksheetCard(selections, "zh-tw");
  assert(worksheetCardSchema.safeParse(card).success);
  assert.match(card.who, /月底做結算的營運主管/);
  assert.match(card.hypothesis, /合併三份試算表/);
  assert.match(card.question, /多少時間或錢/);
  const paid = { ...selections, evidence: { choices: ["paid"], detail: "" } };
  assert.match(worksheetNextAction(paid, "en"), /paying customer/);
  assert.match(worksheetNextAction({ ...paid, evidence: { choices: ["interviews"], detail: "" } }, "en"), /someone new/);
  const state = evidenceStateSchema.parse({ worksheet: { answers: paid, card, locale: "zh-tw", revision: 1 } });
  const result = evaluateEvidence(state, [], 0);
  assert.equal(result.paid, 0);
  assert.equal(result.conversations, 0);
  assert.equal(result.status, "unverified");
  assert.deepEqual(evidenceStateSchema.parse(JSON.parse(JSON.stringify(state))).worksheet, state.worksheet);
});
