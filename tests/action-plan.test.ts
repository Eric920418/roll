import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bottleneckLabel, urgencyWeight } from "../src/lib/action-plan/constants";
import { priorityScore, rankActions, wouldCreateCycle, type RankableAction } from "../src/lib/action-plan/ranking";
import {
  actionInputSchema,
  appendGeneratedActions,
  generatedActionSchema,
  generatedPlanSchema,
  normalizeGeneratedActionInput,
} from "../src/lib/action-plan/schemas";
import type { GeneratedAction } from "../src/lib/action-plan/schemas";
import {
  calculateDashboardProgress,
  deriveDashboardPriority,
  nextCompanyStage,
} from "../src/lib/action-plan/dashboard";
import { formatActionTime, legacyHoursForMinutes } from "../src/lib/action-plan/time";
import type { ActionPlanDto } from "../src/lib/action-plan/service";

function action(overrides: Partial<RankableAction> = {}): RankableAction {
  return {
    id: "a",
    title: "Define ICP",
    impact: "Critical",
    urgencyType: "urgent",
    urgencyDays: null,
    dependencyLevel: 0,
    dependencyNotes: null,
    difficulty: 2,
    actionTimeMinHours: 4,
    actionTimeMaxHours: 8,
    actionTimeMinMinutes: null,
    actionTimeMaxMinutes: null,
    companyStage: "Validation",
    stageFit: 5,
    stageFitReason: "Directly validates the market",
    stageFitConfidence: 90,
    bottleneckGroup: "Sales",
    bottleneckCode: "no_icp",
    bottleneckFit: 5,
    bottleneckFitReason: "Resolves the missing ICP",
    bottleneckFitConfidence: 95,
    outcomeCategory: "customers",
    expectedOutcome: "1 ICP and 3 buyer personas",
    outcomeTimeMinDays: 2,
    outcomeTimeMaxDays: 3,
    done: false,
    source: "nova",
    stageFitEditedByUser: false,
    bottleneckFitEditedByUser: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    dependencies: [],
    ...overrides,
  };
}

function generated(index: number): GeneratedAction {
  return {
    clientKey: `action-${index}`,
    title: `Action number ${index}`,
    impact: "High",
    urgencyType: "scheduled",
    urgencyDays: 3,
    dependencyLevel: 0,
    dependencyNotes: null,
    dependsOnKeys: [],
    difficulty: 2,
    actionTime: { minMinutes: 120, maxMinutes: 240 },
    companyStage: "Validation",
    stageFit: { score: 4, reason: "Fits the current validation work", confidence: 85 },
    bottleneckGroup: "Sales",
    bottleneckCode: "no_leads",
    bottleneckFit: { score: 4, reason: "Builds qualified lead generation", confidence: 80 },
    outcomeCategory: "customers",
    expectedOutcome: `${index} qualified customer conversations`,
    outcomeTime: { min: 2, max: 7 },
  };
}

test("Priority score 使用固定權重公式並保留兩位小數", () => {
  assert.equal(priorityScore(action()), 250);
  assert.equal(priorityScore(action({ impact: "Medium", urgencyType: "scheduled", urgencyDays: 8, stageFit: 3, bottleneckFit: 4, difficulty: 5 })), 7.2);
  assert.deepEqual([1, 3, 4, 7, 8].map((days) => urgencyWeight("scheduled", days)), [3, 3, 2, 2, 1]);
});

test("No leads 正確顯示為 Sales · Lead generation，不映射為 conversion", () => {
  assert.equal(bottleneckLabel("Sales", "no_leads"), "Lead generation");
});

test("Required dependency 未完成時排除 Top 3；完成後立即進入排名", () => {
  const dependency = { id: "base", title: "Finish interviews", done: false };
  const blocked = action({
    id: "blocked",
    title: "Build pilot",
    dependencyLevel: 3,
    dependencies: [{ dependsOn: dependency }],
  });
  const ready = action({ id: "ready", title: "Define ICP", impact: "High" });
  let ranked = rankActions([blocked, ready]);
  assert.equal(ranked.find((item) => item.id === "blocked")?.dependency.blocked, true);
  assert.equal(ranked.find((item) => item.id === "blocked")?.rank, null);
  assert.equal(ranked.find((item) => item.id === "ready")?.rank, 1);

  dependency.done = true;
  ranked = rankActions([blocked, ready]);
  assert.equal(ranked.find((item) => item.id === "blocked")?.dependency.blocked, false);
  assert.equal(ranked.find((item) => item.id === "blocked")?.rank, 1);
});

test("完成項目排除排名；同分依 urgency、impact、較短時間、建立時間排序", () => {
  const rows = rankActions([
    action({ id: "done", done: true, impact: "Critical" }),
    action({ id: "older", impact: "High", urgencyType: "urgent", actionTimeMaxMinutes: 60, createdAt: "2026-01-01" }),
    action({ id: "newer", impact: "High", urgencyType: "urgent", actionTimeMaxMinutes: 60, createdAt: "2026-01-02" }),
    action({ id: "slower", impact: "High", urgencyType: "urgent", actionTimeMaxMinutes: 90 }),
  ]);
  assert.deepEqual(rows.filter((row) => row.rank != null).map((row) => row.id), ["older", "newer", "slower"]);
  assert.equal(rows.find((row) => row.id === "done")?.rank, null);
});

test("依賴圖拒絕 self-reference 與循環", () => {
  const graph = new Map<string, string[]>([["a", ["b"]], ["b", []]]);
  assert.equal(wouldCreateCycle(graph, "b", ["a"]), true);
  assert.equal(wouldCreateCycle(graph, "a", ["a"]), true);
  assert.equal(wouldCreateCycle(graph, "b", []), false);
});

test("生成驗證接受 20、24、100 項，拒絕 101 項與重複 clientKey", () => {
  for (const count of [20, 24, 100]) {
    assert.equal(generatedPlanSchema.safeParse({ actions: Array.from({ length: count }, (_, index) => generated(index)) }).success, true);
  }
  assert.equal(generatedPlanSchema.safeParse({ actions: Array.from({ length: 101 }, (_, index) => generated(index)) }).success, false);
  const duplicate = Array.from({ length: 20 }, (_, index) => generated(index));
  duplicate[19].clientKey = duplicate[0].clientKey;
  assert.equal(generatedPlanSchema.safeParse({ actions: duplicate }).success, false);
});

test("AI 分批生成可累積完整計畫，並拒絕重複 key、向後依賴與超量", () => {
  const first = [generated(0), generated(1)];
  const second = [{ ...generated(2), dependencyLevel: 3 as const, dependsOnKeys: ["action-1"] }];
  assert.deepEqual(appendGeneratedActions(first, second, 3).map((item) => item.clientKey), [
    "action-0", "action-1", "action-2",
  ]);
  assert.throws(() => appendGeneratedActions(first, [generated(1)], 3), /clientKey 不可重複/);
  assert.throws(
    () => appendGeneratedActions(first, [{ ...generated(2), dependsOnKeys: ["action-9"] }], 3),
    /必須指向先前已生成/,
  );
  assert.throws(() => appendGeneratedActions(first, [generated(2), generated(3)], 3), /數量超過/);
});

test("AI 的 Immediate/Urgent 天數與空白依賴備註標準化為 null，Scheduled 缺天數仍拒絕", () => {
  const urgent = normalizeGeneratedActionInput({
    ...generated(0),
    urgencyType: "urgent",
    urgencyDays: 0,
    dependencyNotes: "",
  });
  assert.equal(generatedActionSchema.safeParse(urgent).success, true);
  assert.equal((urgent as { urgencyDays: number | null }).urgencyDays, null);
  assert.equal((urgent as { dependencyNotes: string | null }).dependencyNotes, null);

  const scheduled = normalizeGeneratedActionInput({ ...generated(0), urgencyType: "scheduled", urgencyDays: null });
  assert.equal(generatedActionSchema.safeParse(scheduled).success, false);
});

test("生成驗證拒絕時間反轉、Fit 超界、錯誤 enum、缺少依賴目標與循環", () => {
  const cases = [
    { ...generated(0), actionTime: { minMinutes: 120, maxMinutes: 30 } },
    { ...generated(0), stageFit: { score: 6, reason: "Too high", confidence: 90 } },
    { ...generated(0), impact: "Extreme" },
    { ...generated(0), dependencyLevel: 3, dependsOnKeys: ["missing"] },
  ];
  for (const invalid of cases) {
    const actions = Array.from({ length: 20 }, (_, index) => index === 0 ? invalid : generated(index));
    assert.equal(generatedPlanSchema.safeParse({ actions }).success, false);
  }
  const circular = Array.from({ length: 20 }, (_, index) => generated(index));
  circular[0] = { ...circular[0], dependencyLevel: 3, dependsOnKeys: ["action-1"] };
  circular[1] = { ...circular[1], dependencyLevel: 3, dependsOnKeys: ["action-0"] };
  assert.equal(generatedPlanSchema.safeParse({ actions: circular }).success, false);
});

test("Anthropic strict tool schema 不包含供應商不支援的範圍關鍵字", () => {
  const source = readFileSync("src/lib/action-plan/ai.ts", "utf8");
  for (const keyword of ["minimum", "maximum", "minItems", "maxItems", "anyOf"]) {
    assert.doesNotMatch(source, new RegExp(`\\b${keyword}\\s*:`));
  }
});

test("24 項生成保留五分鐘執行時間，且前端完整顯示非 JSON 平台錯誤", () => {
  const ai = readFileSync("src/lib/action-plan/ai.ts", "utf8");
  const route = readFileSync("src/app/api/action-plans/generate/route.ts", "utf8");
  const builder = readFileSync("src/components/dashboard/ActionPlanBuilder.tsx", "utf8");
  assert.match(ai, /const GENERATION_BATCH_SIZE = 2;/);
  assert.match(ai, /properties: Object\.fromEntries\(slotNames\.map/);
  assert.match(ai, /required: slotNames/);
  assert.match(ai, /Fill every required numbered action field/);
  assert.match(ai, /actionTimeMinMinutes/);
  assert.doesNotMatch(ai, /companyStage: \{ type: "string" as const/);
  assert.match(route, /export const maxDuration = 300;/);
  assert.match(builder, /await response\.text\(\)/);
  assert.doesNotMatch(builder, /await response\.json\(\)/);
});

test("Action time 使用分鐘、保留舊 hours mutation 相容，並正確格式化", () => {
  assert.deepEqual(legacyHoursForMinutes({ minMinutes: 30, maxMinutes: 90 }), {
    minHours: 0,
    maxHours: 2,
  });
  assert.equal(formatActionTime({ minMinutes: 30, maxMinutes: 90 }, "en"), "30m–1h 30m");
  assert.equal(formatActionTime({ minMinutes: 90, maxMinutes: 90 }, "zh-tw"), "1 小時 30 分鐘");

  const base = generated(0);
  const mutation = {
    title: base.title,
    impact: base.impact,
    urgencyType: base.urgencyType,
    urgencyDays: base.urgencyDays,
    dependencyLevel: base.dependencyLevel,
    dependencyNotes: base.dependencyNotes,
    dependencyActionIds: [],
    difficulty: base.difficulty,
    companyStage: base.companyStage,
    stageFit: base.stageFit,
    bottleneckGroup: base.bottleneckGroup,
    bottleneckCode: base.bottleneckCode,
    bottleneckFit: base.bottleneckFit,
    outcomeCategory: base.outcomeCategory,
    expectedOutcome: base.expectedOutcome,
    outcomeTime: base.outcomeTime,
  };
  const minutes = actionInputSchema.parse({
    ...mutation,
    actionTime: { minMinutes: 30, maxMinutes: 90 },
  });
  assert.deepEqual(minutes.actionTime, { minMinutes: 30, maxMinutes: 90 });
  const legacy = actionInputSchema.parse({
    ...mutation,
    actionTime: { min: 1, max: 2 },
  });
  assert.deepEqual(legacy.actionTime, { minMinutes: 60, maxMinutes: 120 });
});

function dashboardPlan(actions: ReturnType<typeof rankActions>): ActionPlanDto {
  return {
    id: "plan",
    locale: "en",
    diagnosis: {
      companyStage: "Validation",
      stageReason: "Customer evidence is still being collected",
      stageConfidence: 88,
      bottleneckGroup: "Sales",
      bottleneckCode: "no_leads",
      bottleneckReason: "The company needs qualified conversations",
      bottleneckConfidence: 91,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    actions,
    nextMoves: actions.filter((item) => item.rank != null && item.rank <= 3),
    blockers: actions
      .filter((item) => !item.done && item.dependency.blocked)
      .map((item) => ({ id: item.id, title: item.title, dependencies: item.dependency.actionTitles })),
  };
}

test("Dashboard priority 遵守方案、Action、依賴、完成與診斷引導順序", () => {
  const readyPlan = dashboardPlan(rankActions([action({ id: "ready" })]));
  assert.equal(deriveDashboardPriority({ isPaying: false, onboardingDone: true, quizDone: true, plan: readyPlan }).kind, "upgrade");
  assert.equal(deriveDashboardPriority({ isPaying: true, onboardingDone: false, quizDone: false, plan: readyPlan }).kind, "action");

  const blockedPlan = dashboardPlan(rankActions([action({
    id: "blocked",
    dependencyLevel: 3,
    dependencies: [{ dependsOn: { id: "dependency", title: "Finish discovery", done: false } }],
  })]));
  assert.equal(deriveDashboardPriority({ isPaying: true, onboardingDone: true, quizDone: true, plan: blockedPlan }).kind, "blocked");

  const donePlan = dashboardPlan(rankActions([action({ id: "done", done: true })]));
  assert.equal(deriveDashboardPriority({ isPaying: true, onboardingDone: true, quizDone: true, plan: donePlan }).kind, "complete");
  assert.equal(deriveDashboardPriority({ isPaying: true, onboardingDone: false, quizDone: false, plan: null }).kind, "onboarding");
  assert.equal(deriveDashboardPriority({ isPaying: true, onboardingDone: true, quizDone: false, plan: null }).kind, "quiz");
  assert.equal(deriveDashboardPriority({ isPaying: true, onboardingDone: true, quizDone: true, plan: null }).kind, "build");
});

test("Dashboard progress 依 outcome 分組，排除 custom，無資料顯示 null", () => {
  const actions = rankActions([
    action({ id: "product-done", outcomeCategory: "product", done: true }),
    action({ id: "product-open", outcomeCategory: "product" }),
    action({ id: "sales-customer", outcomeCategory: "customers", done: true }),
    action({ id: "sales-revenue", outcomeCategory: "revenue" }),
    action({ id: "fundraising", outcomeCategory: "fundraising", done: true }),
    action({ id: "custom", outcomeCategory: "custom", done: true }),
  ]);
  const progress = calculateDashboardProgress(actions);
  assert.deepEqual(progress.product, { done: 1, total: 2, percent: 50 });
  assert.deepEqual(progress.sales, { done: 1, total: 2, percent: 50 });
  assert.deepEqual(progress.fundraising, { done: 1, total: 1, percent: 100 });
  assert.deepEqual(progress.expansion, { done: 0, total: 0, percent: null });
  assert.equal(nextCompanyStage("Validation"), "MVP");
  assert.equal(nextCompanyStage("Expansion"), null);
});

test("Dashboard home 英文與繁中翻譯鍵完全平行", () => {
  const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
  const zh = JSON.parse(readFileSync("messages/zh-tw.json", "utf8"));
  function leafKeys(value: unknown, prefix = ""): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
    return Object.entries(value).flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  assert.deepEqual(
    leafKeys(en.Dashboard.home).sort(),
    leafKeys(zh.Dashboard.home).sort(),
  );
});
