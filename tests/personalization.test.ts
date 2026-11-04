import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { personalizationSchema, PERSONALIZATION_QUESTIONS, personalizedActions, personalizedSteps, personalizationRoute, personalizationResponses, type Personalization } from "../src/lib/action-plan/personalization";
import { generatedPlanSchema, generateBodySchema, diagnoseBodySchema } from "../src/lib/action-plan/schemas";
import { readBuilderDraft, newBuilderDraft } from "../src/lib/action-plan/builder-draft";
import { readDiscoverySetup } from "../src/lib/discovery/policy";
import { commercialTask } from "../src/lib/validation/schema";
import { workspaceKind } from "../src/lib/action-plan/workspace";
const diagnosis = { companyStage: "MVP", stageReason: "Working prototype", stageConfidence: 60, bottleneckGroup: "Sales", bottleneckCode: "no_icp", bottleneckReason: "Buyer assumptions need validation", bottleneckConfidence: 50 } as const;
export const answers: Personalization = { payingCustomers: "none", interviews: "none", channel: "referrals", weeklyTime: "under3", goal: "validate" };

test("Every valid questionnaire combination yields five valid dependent tasks without invented progress", () => {
  let count = 0;
  for (const payingCustomers of PERSONALIZATION_QUESTIONS[0].options.map(o => o[0]))
    for (const interviews of PERSONALIZATION_QUESTIONS[1].options.map(o => o[0]))
      for (const channel of PERSONALIZATION_QUESTIONS[2].options.map(o => o[0]))
        for (const weeklyTime of PERSONALIZATION_QUESTIONS[3].options.map(o => o[0]))
          for (const goal of PERSONALIZATION_QUESTIONS[4].options.map(o => o[0])) {
            const value = personalizationSchema.parse({ payingCustomers, interviews, channel, weeklyTime, goal });
            for (const locale of ["en", "zh-tw"] as const) {
              const actions = personalizedActions(value, locale, diagnosis);
              assert(generatedPlanSchema.safeParse({ actions }).success);
              assert.equal(actions.length, 5); assert.equal(actions[0]!.dependsOnKeys.length, 0);
              assert(!commercialTask(actions[0]!)); assert(!commercialTask(actions[1]!));
              if (goal === "first_order" || goal === "fundraising") assert(commercialTask(actions[3]!));
              assert(actions.slice(1).every((a, i) => a.dependsOnKeys[0] === `task_${i + 1}`));
              if (payingCustomers === "6-20" || payingCustomers === "21+") assert(!actions.some(a => workspaceKind(a) === "interview"));
              if (weeklyTime === "under3") assert.deepEqual(actions.map(a => a.urgencyDays), [7, 14, 21, 28, 35]);
              if (goal === "fundraising") assert.equal(actions[4]!.outcomeCategory, "fundraising");
              assert.equal(personalizationResponses(value, locale).length, 5);
              assert(actions.every(a => !("done" in a) && !("completedAt" in a) && !("metricCurrent" in a)));
            }
            count++;
          }
  assert.equal(count, 1280);
});
test("Five answers are strict, old opening answers remain separate and drafts survive reload", () => {
  assert.equal(personalizationRoute(answers), "interviews");
  assert.equal(personalizationRoute({ ...answers, interviews: "1-5" }), "first_order");
  assert.equal(personalizationRoute({ ...answers, payingCustomers: "1-5" }), "steady_customers");
  assert.equal(personalizationRoute({ ...answers, payingCustomers: "6-20" }), "sales");
  assert(!personalizationSchema.safeParse({ ...answers, channel: "invented" }).success);
  assert(!personalizationSchema.safeParse({ ...answers, extra: "grant_pro" }).success);
  const { goal: _, ...incomplete } = answers; void _;
  assert(!diagnoseBodySchema.safeParse({ personalization: incomplete }).success);
  const body = { requestId: randomUUID(), answers: [], diagnosis, personalization: answers };
  assert(generateBodySchema.safeParse(body).success);
  assert(!generateBodySchema.safeParse({ ...body, personalization: undefined }).success);
  const draft = { ...newBuilderDraft("en", body.requestId), answers: [{ question: "Old opening question", answer: "Original answer" }], personalization: answers, diagnosis };
  assert.equal(readBuilderDraft(JSON.stringify(draft))?.answers[0]?.answer, "Original answer");
  assert.deepEqual(readBuilderDraft(JSON.stringify(draft))?.personalization, answers);
  assert(readDiscoverySetup({ requestId: body.requestId, locale: "en", answers: [], personalization: answers, diagnosis, confirmed: true }));
  assert.equal(personalizedSteps({ ...answers, goal: "fundraising" }, "en")[4], "Prepare fundraising materials and evidence, and review investor sharing settings");
  assert.notEqual(personalizedSteps({ ...answers, channel: "events" }, "en")[2], personalizedSteps(answers, "en")[2]);
});
test("Schema change adds only one nullable snapshot and does not replace old answers", () => {
  const schema = readFileSync("prisma/next-steps-personalization.sql", "utf8");
  assert.match(schema, /ADD COLUMN IF NOT EXISTS "personalization" JSONB/);
  assert.doesNotMatch(schema, /\b(?:UPDATE|DELETE|DROP|TRUNCATE|NOT NULL)\b/);
});

test("Both questionnaire languages render exactly five accessible single-choice groups and preserve selected values", async () => {
  const { default: Questions } = await import("../src/components/dashboard/PersonalizationQuestions");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  for (const locale of ["en", "zh-tw"] as const) {
    const html = renderToStaticMarkup(createElement(Questions, { locale, value: answers, disabled: false, onChange() {} }));
    assert.equal((html.match(/<fieldset/g) || []).length, 5);
    assert.equal((html.match(/type="radio"/g) || []).length, 21);
    assert.equal((html.match(/checked=""/g) || []).length, 5);
    assert.doesNotMatch(html, /<textarea/);
    assert.match(html, /min-h-11/);
    assert.match(html, locale === "en" ? /How many paying customers/ : /你目前有幾個付費客戶/);
  }
});
