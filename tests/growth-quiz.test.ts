import assert from "node:assert/strict";
import { test } from "node:test";
import { GROWTH_DIMENSIONS, parseGrowthProfile } from "../src/lib/quiz/growth";

test("growth assessment accepts three ordered answers but never treats legacy scores as growth", () => {
  const answers = GROWTH_DIMENSIONS.map((dimension) => ({
    dimension,
    choice: "C",
    label: { en: "Goal", "zh-tw": "目標" },
    desc: { en: "Description", "zh-tw": "說明" },
  }));
  assert.equal(parseGrowthProfile({ planningDepth: 80 }), null);
  assert.equal(parseGrowthProfile({ kind: "growth-v1", answers: answers.slice(0, 2) }), null);
  assert.equal(parseGrowthProfile({ kind: "growth-v1", answers: [...answers].reverse() }), null);
  assert.deepEqual(parseGrowthProfile({ kind: "growth-v1", answers })?.answers, answers);
});
