import { z } from "zod";
import {
  BOTTLENECKS,
  COMPANY_STAGES,
  IMPACT_WEIGHTS,
  OUTCOME_CATEGORIES,
  URGENCY_TYPES,
  isValidBottleneck,
} from "./constants";

const fitSchema = z.object({
  score: z.number().int().min(1).max(5),
  reason: z.string().trim().min(3).max(600),
  confidence: z.number().int().min(0).max(100).nullable(),
});

const timeRangeSchema = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .refine((v) => v.max >= v.min, "時間上限不可小於下限");

const actionMinuteRangeSchema = z
  .object({
    minMinutes: z.number().int().min(15),
    maxMinutes: z.number().int().min(15),
  })
  .refine((value) => value.maxMinutes >= value.minMinutes, {
    message: "Action time 上限不可小於下限",
    path: ["maxMinutes"],
  });

// 相容上一版 mutation 的 {min,max} 小時格式；新 UI 與 AI 一律送分鐘。
const legacyActionHourRangeSchema = timeRangeSchema.transform((value) => ({
  minMinutes: value.min * 60,
  maxMinutes: value.max * 60,
}));

const actionTimeInputSchema = z.union([
  actionMinuteRangeSchema,
  legacyActionHourRangeSchema,
]);

export function normalizeGeneratedActionInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const action = value as Record<string, unknown>;
  return {
    ...action,
    urgencyDays: action.urgencyType === "scheduled" ? action.urgencyDays : null,
    dependencyNotes: typeof action.dependencyNotes === "string" && action.dependencyNotes.trim()
      ? action.dependencyNotes
      : null,
  };
}

export const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const diagnosisSchema = z
  .object({
    companyStage: z.enum(COMPANY_STAGES),
    stageReason: z.string().trim().min(3).max(1000),
    stageConfidence: z.number().int().min(0).max(100),
    bottleneckGroup: z.enum(Object.keys(BOTTLENECKS) as [keyof typeof BOTTLENECKS, ...(keyof typeof BOTTLENECKS)[]]),
    bottleneckCode: z.string().trim().min(1),
    bottleneckReason: z.string().trim().min(3).max(1000),
    bottleneckConfidence: z.number().int().min(0).max(100),
  })
  .superRefine((value, ctx) => {
    if (!isValidBottleneck(value.bottleneckGroup, value.bottleneckCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["bottleneckCode"],
        message: "Bottleneck code 不屬於指定 group",
      });
    }
  });

export const diagnoseBodySchema = z.object({
  locale: z.enum(["en", "zh-tw"]).default("en"),
  messages: z.array(conversationMessageSchema).max(30).default([]),
  answers: z
    .array(z.object({ question: z.string().trim().min(1).max(1000), answer: z.string().trim().min(1).max(4000) }))
    .max(3)
    .default([]),
});

export const generatedActionSchema = z
  .object({
    clientKey: z.string().trim().min(1).max(80),
    title: z.string().trim().min(3).max(200),
    impact: z.enum(Object.keys(IMPACT_WEIGHTS) as [keyof typeof IMPACT_WEIGHTS, ...(keyof typeof IMPACT_WEIGHTS)[]]),
    urgencyType: z.enum(URGENCY_TYPES),
    urgencyDays: z.number().int().min(1).max(365).nullable(),
    dependencyLevel: z.number().int().min(0).max(3),
    dependencyNotes: z.string().trim().max(1000).nullable(),
    dependsOnKeys: z.array(z.string().trim().min(1).max(80)).max(20),
    difficulty: z.number().int().min(1).max(5),
    actionTime: actionMinuteRangeSchema,
    companyStage: z.enum(COMPANY_STAGES),
    stageFit: fitSchema,
    bottleneckGroup: z.enum(Object.keys(BOTTLENECKS) as [keyof typeof BOTTLENECKS, ...(keyof typeof BOTTLENECKS)[]]),
    bottleneckCode: z.string().trim().min(1),
    bottleneckFit: fitSchema,
    outcomeCategory: z.enum(OUTCOME_CATEGORIES),
    expectedOutcome: z.string().trim().min(3).max(1000),
    outcomeTime: timeRangeSchema,
  })
  .superRefine((value, ctx) => {
    if (value.urgencyType === "scheduled" && value.urgencyDays == null) {
      ctx.addIssue({ code: "custom", path: ["urgencyDays"], message: "Scheduled urgency 必須提供天數" });
    }
    if (value.urgencyType !== "scheduled" && value.urgencyDays != null) {
      ctx.addIssue({ code: "custom", path: ["urgencyDays"], message: "Immediate/Urgent 不可提供 scheduled days" });
    }
    if (!isValidBottleneck(value.bottleneckGroup, value.bottleneckCode)) {
      ctx.addIssue({ code: "custom", path: ["bottleneckCode"], message: "Bottleneck code 不屬於指定 group" });
    }
    if (value.dependencyLevel === 0 && value.dependsOnKeys.length > 0) {
      ctx.addIssue({ code: "custom", path: ["dependsOnKeys"], message: "Dependency 0 不可指定依賴 Action" });
    }
    if (value.outcomeTime.max < 1) {
      ctx.addIssue({ code: "custom", path: ["outcomeTime"], message: "Outcome time 至少為 1 天" });
    }
  });

export const generatedPlanSchema = z
  .object({ actions: z.array(generatedActionSchema).min(20).max(100) })
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    for (const [index, action] of value.actions.entries()) {
      if (keys.has(action.clientKey)) {
        ctx.addIssue({ code: "custom", path: ["actions", index, "clientKey"], message: "clientKey 不可重複" });
      }
      keys.add(action.clientKey);
    }
    const graph = new Map(value.actions.map((a) => [a.clientKey, a.dependsOnKeys]));
    for (const [index, action] of value.actions.entries()) {
      for (const key of action.dependsOnKeys) {
        if (!keys.has(key)) {
          ctx.addIssue({ code: "custom", path: ["actions", index, "dependsOnKeys"], message: `找不到依賴目標 ${key}` });
        }
        if (key === action.clientKey) {
          ctx.addIssue({ code: "custom", path: ["actions", index, "dependsOnKeys"], message: "Action 不可依賴自己" });
        }
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    function visit(key: string): boolean {
      if (visiting.has(key)) return true;
      if (visited.has(key)) return false;
      visiting.add(key);
      for (const next of graph.get(key) ?? []) if (visit(next)) return true;
      visiting.delete(key);
      visited.add(key);
      return false;
    }
    for (const key of graph.keys()) {
      if (visit(key)) {
        ctx.addIssue({ code: "custom", path: ["actions"], message: "Action dependencies 不可形成循環" });
        break;
      }
    }
  });

export function appendGeneratedActions(
  existing: GeneratedAction[],
  incoming: GeneratedAction[],
  expectedCount: number,
): GeneratedAction[] {
  if (incoming.length === 0) throw new Error("NOVA 未回傳任何 Action");
  if (existing.length + incoming.length > expectedCount) {
    throw new Error(`Action 數量超過要求的 ${expectedCount} 項`);
  }

  const availableKeys = new Set(existing.map((action) => action.clientKey));
  for (const action of incoming) {
    if (availableKeys.has(action.clientKey)) {
      throw new Error(`clientKey 不可重複：${action.clientKey}`);
    }
    for (const dependencyKey of action.dependsOnKeys) {
      if (!availableKeys.has(dependencyKey)) {
        throw new Error(`依賴 ${dependencyKey} 必須指向先前已生成的 Action`);
      }
    }
    availableKeys.add(action.clientKey);
  }

  return [...existing, ...incoming];
}

export const generateBodySchema = z.object({
  locale: z.enum(["en", "zh-tw"]).default("en"),
  messages: z.array(conversationMessageSchema).max(30).default([]),
  diagnosis: diagnosisSchema,
  requestId: z.string().uuid(),
  candidateCount: z.number().int().min(20).max(100).default(24),
});

const generatedShape = generatedActionSchema.shape;
export const actionInputSchema = z
  .object({
    title: generatedShape.title,
    impact: generatedShape.impact,
    urgencyType: generatedShape.urgencyType,
    urgencyDays: generatedShape.urgencyDays,
    dependencyLevel: generatedShape.dependencyLevel,
    dependencyNotes: generatedShape.dependencyNotes,
    dependencyActionIds: z.array(z.string().min(1)).max(20).default([]),
    difficulty: generatedShape.difficulty,
    actionTime: actionTimeInputSchema,
    companyStage: generatedShape.companyStage,
    stageFit: generatedShape.stageFit,
    bottleneckGroup: generatedShape.bottleneckGroup,
    bottleneckCode: generatedShape.bottleneckCode,
    bottleneckFit: generatedShape.bottleneckFit,
    outcomeCategory: generatedShape.outcomeCategory,
    expectedOutcome: generatedShape.expectedOutcome,
    outcomeTime: generatedShape.outcomeTime,
  })
  .superRefine((value, ctx) => {
    if (value.urgencyType === "scheduled" && value.urgencyDays == null) {
      ctx.addIssue({ code: "custom", path: ["urgencyDays"], message: "Scheduled urgency 必須提供天數" });
    }
    if (value.urgencyType !== "scheduled" && value.urgencyDays != null) {
      ctx.addIssue({ code: "custom", path: ["urgencyDays"], message: "Immediate/Urgent 不可提供 scheduled days" });
    }
    if (!isValidBottleneck(value.bottleneckGroup, value.bottleneckCode)) {
      ctx.addIssue({ code: "custom", path: ["bottleneckCode"], message: "Bottleneck code 不屬於指定 group" });
    }
    if (value.dependencyLevel === 0 && value.dependencyActionIds.length > 0) {
      ctx.addIssue({ code: "custom", path: ["dependencyActionIds"], message: "Dependency 0 不可指定依賴 Action" });
    }
    if (value.actionTime.maxMinutes < 1 || value.outcomeTime.max < 1) {
      ctx.addIssue({ code: "custom", path: ["actionTime"], message: "時間上限至少為 1" });
    }
  });

export const actionPatchSchema = z.union([
  z.object({ done: z.boolean() }),
  actionInputSchema.extend({ done: z.boolean().optional() }),
]);

export type Diagnosis = z.infer<typeof diagnosisSchema>;
export type GeneratedAction = z.infer<typeof generatedActionSchema>;
export type ActionInput = z.infer<typeof actionInputSchema>;
