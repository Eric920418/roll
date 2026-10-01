import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Children, isValidElement, type ReactNode } from "react";
import test from "node:test";
import { bottleneckLabel, urgencyWeight } from "../src/lib/action-plan/constants";
import { priorityScore, priorityTier, rankActions, taskReference, wouldCreateCycle, type RankableAction } from "../src/lib/action-plan/ranking";
import {
  actionInputSchema,
  diagnosisSchema,
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
    clientKey: "task_1",
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

test("優先級顯示固定區間，原始數值仍用於排名", () => {
  assert.equal(priorityTier(312.5), "Critical");
  assert.equal(priorityTier(100), "High");
  assert.equal(priorityTier(40), "Medium");
  assert.equal(priorityTier(39.99), "Low");
});

test("No leads 正確顯示為 Sales · Lead generation，不映射為 conversion", () => {
  assert.equal(bottleneckLabel("Sales", "no_leads"), "Lead generation");
});

test("任一前置 Action 未完成時排除 Top 3；完成後立即進入排名", () => {
  const dependency = { id: "base", clientKey: "task_1", title: "Finish interviews", done: false };
  const blocked = action({
    id: "blocked",
    clientKey: "task_2",
    title: "Build pilot",
    dependencyLevel: 1,
    dependencies: [{ dependsOn: dependency }],
  });
  const ready = action({ id: "ready", title: "Define ICP", impact: "High" });
  let ranked = rankActions([blocked, ready]);
  assert.equal(ranked.find((item) => item.id === "blocked")?.dependency.blocked, true);
  assert.equal(ranked.find((item) => item.id === "blocked")?.rank, null);
  assert.equal(taskReference(ranked.find((item) => item.id === "blocked")!.dependency.actionRefs[0]), "#1 · Finish interviews");
  assert.equal(ranked.find((item) => item.id === "ready")?.rank, 1);

  dependency.done = true;
  ranked = rankActions([blocked, ready]);
  assert.equal(ranked.find((item) => item.id === "blocked")?.dependency.blocked, false);
  assert.equal(ranked.find((item) => item.id === "blocked")?.rank, 1);
});

test("舊任務若宣稱有依賴卻沒有連結 ID，兩頁都視為 Blocked", () => {
  const ranked = rankActions([action({ id: "legacy", dependencyLevel: 1, dependencies: [] })]);
  assert.equal(ranked[0].dependency.missingLink, true);
  assert.equal(ranked[0].dependency.blocked, true);
  assert.equal(dashboardPlan(ranked).nextMoves.length, 0);
});

test("收款 → 付費方案 → 試點依完成狀態逐一解鎖，不因高分跳過前置任務", () => {
  const payment = { id: "payment", clientKey: "task_1", title: "建立收款系統", done: false };
  const offer = { id: "offer", clientKey: "task_2", title: "推出付費方案", done: false };
  const rows = [
    action({ id: payment.id, clientKey: payment.clientKey, title: payment.title, impact: "Medium" }),
    action({ id: offer.id, clientKey: offer.clientKey, title: offer.title, dependencyLevel: 1, dependencies: [{ dependsOn: payment }] }),
    action({ id: "pilot", clientKey: "task_3", title: "啟動付費試點", dependencyLevel: 1, dependencies: [{ dependsOn: offer }] }),
  ];
  assert.deepEqual(dashboardPlan(rankActions(rows)).nextMoves.map((item) => item.clientKey), ["task_1"]);
  payment.done = true;
  rows[0].done = true;
  assert.deepEqual(dashboardPlan(rankActions(rows)).nextMoves.map((item) => item.clientKey), ["task_2"]);
  offer.done = true;
  rows[1].done = true;
  assert.deepEqual(dashboardPlan(rankActions(rows)).nextMoves.map((item) => item.clientKey), ["task_3"]);
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

test("生成驗證接受新版 5 項及舊計畫規模，拒絕不足 5 項、101 項與重複 clientKey", () => {
  for (const count of [5, 20, 24, 100]) {
    assert.equal(generatedPlanSchema.safeParse({ actions: Array.from({ length: count }, (_, index) => generated(index)) }).success, true);
  }
  assert.equal(generatedPlanSchema.safeParse({ actions: Array.from({ length: 4 }, (_, index) => generated(index)) }).success, false);
  assert.equal(generatedPlanSchema.safeParse({ actions: Array.from({ length: 101 }, (_, index) => generated(index)) }).success, false);
  const duplicate = Array.from({ length: 20 }, (_, index) => generated(index));
  duplicate[19].clientKey = duplicate[0].clientKey;
  assert.equal(generatedPlanSchema.safeParse({ actions: duplicate }).success, false);
  const inflated = Array.from({ length: 5 }, (_, index) => generated(index));
  inflated[0].impact = "Critical";
  inflated[1].impact = "Critical";
  assert.equal(generatedPlanSchema.safeParse({ actions: inflated }).success, false);
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
  assert.throws(() => appendGeneratedActions([{ ...generated(0), impact: "Critical" }], [{ ...generated(1), impact: "Critical" }], 3), /最多一項 Critical/);
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
    { ...generated(0), dependencyLevel: 1, dependsOnKeys: [] },
    { ...generated(0), dependencyLevel: 1, dependsOnKeys: ["action-1", "action-1"] },
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

test("5 項生成保留五分鐘執行時間，且前端完整顯示非 JSON 平台錯誤", () => {
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
      .map((item) => ({ id: item.id, title: item.title, dependencies: item.dependency.actionTitles, missingLink: item.dependency.missingLink })),
  };
}

test("Dashboard priority 遵守方案、Action、依賴、完成與診斷引導順序", () => {
  const readyPlan = dashboardPlan(rankActions([action({ id: "ready" })]));
  assert.equal(deriveDashboardPriority({ isPaying: false, onboardingDone: true, quizDone: true, plan: readyPlan }).kind, "upgrade");
  assert.equal(deriveDashboardPriority({ isPaying: true, onboardingDone: false, quizDone: false, plan: readyPlan }).kind, "action");

  const blockedPlan = dashboardPlan(rankActions([action({
    id: "blocked",
    dependencyLevel: 3,
    dependencies: [{ dependsOn: { id: "dependency", clientKey: "task_1", title: "Finish discovery", done: false } }],
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


type AiRequest = {
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools: Array<{ input_schema: { required: string[] } }>;
};

function loadAi(create: (request: AiRequest) => Promise<unknown>) {
  const require = createRequire(import.meta.url);
  const loaded = { exports: {} as typeof import("../src/lib/action-plan/ai") };
  const code = ts.transpileModule(readFileSync("src/lib/action-plan/ai.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  runInNewContext(code, {
    module: loaded, exports: loaded.exports, process: { env: {} }, console,
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "@anthropic-ai/sdk") return class { messages = { create }; };
      if (id === "./constants") return require("../src/lib/action-plan/constants");
      if (id === "./schemas") return require("../src/lib/action-plan/schemas");
      return require(id);
    },
  });
  return loaded.exports;
}

const readyDiagnosis = {
  status: "ready", question: "", companyStage: "Validation", stageReason: "Testing with paying customers",
  stageConfidence: 80, bottleneckCode: "no_leads", bottleneckReason: "No qualified sales leads", bottleneckConfidence: 80,
};

const toolReply = (name: string, input: unknown) => ({
  content: [{ type: "tool_use", name, input }], stop_reason: "tool_use", usage: { output_tokens: 100 },
});

test("診斷將 Q&A 作為對話、拒絕重問並修復，分類由代碼推導", async () => {
  const requests: AiRequest[] = [];
  const ai = loadAi(async (request) => {
    requests.push(request);
    return toolReply("submit_action_plan_diagnosis", requests.length === 1
      ? { ...readyDiagnosis, status: "needs_input", question: "  WHO buys from you？ " }
      : { ...readyDiagnosis, bottleneckGroup: "Product" });
  });
  const result = await ai.diagnoseActionPlan({ locale: "en", profile: null, quiz: null, messages: [], answers: [{ question: "Who buys from you?", answer: "APAC enterprise buyers" }] });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].messages[2].content, "APAC enterprise buyers");
  assert.match(requests[1].system, /MUST return ready/);
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.diagnosis.bottleneckGroup, "Sales");
});

test("三題後不能繼續追問，無效診斷最多修復一次並回傳驗證原因", async () => {
  let calls = 0;
  const ai = loadAi(async () => {
    calls++;
    return toolReply("submit_action_plan_diagnosis", { ...readyDiagnosis, status: "needs_input", question: "Another question?" });
  });
  await assert.rejects(ai.diagnoseActionPlan({ locale: "en", profile: null, quiz: null, messages: [], answers: Array.from({ length: 3 }, (_, i) => ({ question: `Question ${i}`, answer: `Answer ${i}` })) }), /NOVA 診斷驗證失敗.*不可繼續追問/);
  assert.equal(calls, 2);
});

test("任務生成每批保留診斷作答，成功產出五項", async () => {
  const requests: AiRequest[] = [];
  let index = 0;
  const ai = loadAi(async (request) => {
    requests.push(request);
    return toolReply("submit_action_plan", Object.fromEntries(request.tools[0].input_schema.required.map((slot: string) => {
      const a = generated(++index);
      return [slot, {
        ...a, clientKey: `task_${index}`, actionTimeMinMinutes: 30, actionTimeMaxMinutes: 60,
        stageFitScore: a.stageFit.score, stageFitReason: a.stageFit.reason, stageFitConfidence: a.stageFit.confidence,
        bottleneckFitScore: a.bottleneckFit.score, bottleneckFitReason: a.bottleneckFit.reason, bottleneckFitConfidence: a.bottleneckFit.confidence,
        outcomeTimeMinDays: 2, outcomeTimeMaxDays: 7,
      }];
    })));
  });
  const diagnosis = diagnosisSchema.parse({ ...readyDiagnosis, bottleneckGroup: "Sales" });
  const actions = await ai.generateActionCandidates({ locale: "en", profile: null, quiz: null, messages: [], diagnosis, candidateCount: 5, answers: [{ question: "ICP?", answer: "APAC enterprise buyers" }] });
  assert.equal(actions.length, 5);
  assert.equal(requests.length, 3);
  for (const request of requests) assert.match(request.messages[0].content, /APAC enterprise buyers/);
});

test("診斷失敗保留答案與題號，重試不重複作答，生成包含答案", async () => {
  const state: unknown[] = [], payloads: Array<{ answers: Array<{ question: string; answer: string }> }> = [];
  let cursor = 0;
  const require = createRequire(import.meta.url);
  const loaded = { exports: {} as { default: (props: object) => ReactNode } };
  const responses = [
    { data: { status: "needs_input", question: "Who buys?" } },
    { error: "Diagnostic service unavailable" },
    { data: { status: "ready", diagnosis: { ...readyDiagnosis, bottleneckGroup: "Sales" } } },
    { data: { id: "created-plan" } },
  ];
  const code = ts.transpileModule(readFileSync("src/components/dashboard/ActionPlanBuilder.tsx", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    module: loaded, exports: loaded.exports, crypto: require("node:crypto"),
    fetch: async (_url: string, options: { body: string }) => {
      payloads.push(JSON.parse(options.body));
      const reply = responses.shift()!;
      return new Response(JSON.stringify(reply), { status: "error" in reply ? 500 : 200 });
    },
    require: (id: string) => {
      if (id === "react") return {
        useMemo: (fn: () => unknown) => fn(),
        useState: (initial: unknown) => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value: unknown) => { state[index] = value; }];
        },
      };
      if (id === "next/navigation") return { useRouter: () => ({ push() {}, refresh() {} }) };
      if (id === "next-intl") return { useLocale: () => "en", useTranslations: () => (key: string, values?: { count: number }) => values ? `${key}:${values.count}` : key };
      if (id === "@/lib/action-plan/constants") return require("../src/lib/action-plan/constants");
      if (id === "@/lib/routes") return { pathForLocale: (path: string) => path };
      return require(id);
    },
  });
  type Props = {
    children?: ReactNode; role?: string; value?: string;
    onClick: () => void | Promise<void>;
    onChange: (event: { target: { value: string } }) => void;
    onSubmit: (event: { preventDefault(): void }) => Promise<void>;
  };
  function render() {
    cursor = 0;
    const nodes: Array<{ type: unknown; props: Props }> = [];
    function visit(node: ReactNode) {
      Children.forEach(node, child => {
        if (isValidElement<Props>(child)) { nodes.push(child); visit(child.props.children); }
      });
    }
    visit(loaded.exports.default({}));
    return nodes;
  }
  const button = (text: string) => render().find(n => n.type === "button" && n.props.children === text)!.props;
  button("build").onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  render().find(n => n.type === "textarea")!.props.onChange({ target: { value: "Enterprise buyers" } });
  await render().find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  assert.equal(render().find(n => n.type === "textarea")!.props.value, "Enterprise buyers");
  assert.ok(render().some(n => n.props.children === "questionCount:1"));
  assert.ok(render().some(n => n.props.role === "alert" && n.props.children === "Diagnostic service unavailable"));
  await render().find(n => n.type === "form")!.props.onSubmit({ preventDefault() {} });
  assert.equal(payloads[2].answers.length, 1);
  button("confirmDiagnosis").onClick();
  await button("confirm").onClick();
  assert.deepEqual(payloads[3].answers, [{ question: "Who buys?", answer: "Enterprise buyers" }]);
});
