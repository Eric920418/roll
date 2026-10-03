import { z } from "zod";
import { diagnosisSchema, conversationMessageSchema } from "./schemas";
export const DIAGNOSTIC_QUESTIONS = {
  "zh-tw": [
    "請確認：你現在最想優先解決的瓶頸是什麼？",
    "目前有哪些實際進展或已嘗試的方法？請描述產品狀態、客戶回饋或實際結果；還不知道也可以直接說。",
    "接下來最想達成的具體成果是什麼？請說明希望何時達成，以及可投入的時間或資源。",
  ],
  en: [
    "What is the most important bottleneck you want to address right now?",
    "What progress have you made or approaches have you tried? Describe your product status, customer feedback, or actual results. It is OK not to know yet.",
    "What specific outcome do you want to achieve next? Include your target timeframe and the time or resources you can commit.",
  ],
} as const;
export const builderDraftSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(), requestId: z.string().uuid(),
  locale: z.enum(["en", "zh-tw"]), question: z.string().max(4000), answer: z.string().max(4000),
  answers: z.array(z.object({ question: z.string().min(1).max(4000), answer: z.string().trim().min(1).max(4000) })).max(3),
  diagnosis: diagnosisSchema.nullable(), messages: z.array(conversationMessageSchema).max(30),
  generatingAt: z.number().nonnegative().nullable(),
}).refine(d => !d.diagnosis || d.answers.length === 3, "Diagnosis requires three answers");
export type BuilderDraft = z.infer<typeof builderDraftSchema>;
export const builderStorageKey = (userId: string) => `nova:action-builder:${userId}`;
export function readBuilderDraft(raw: string | null): BuilderDraft | null {
  try { const parsed = builderDraftSchema.safeParse(JSON.parse(raw || "null")); if (!parsed.success) return null;
    const d = parsed.data; return { ...d, question: DIAGNOSTIC_QUESTIONS[d.locale][d.answers.length] || "" };
  } catch { return null; }
}
export function newBuilderDraft(locale: "en" | "zh-tw", requestId: string, messages: BuilderDraft["messages"] = []): BuilderDraft {
  return { version: 1, revision: 0, requestId, locale, question: DIAGNOSTIC_QUESTIONS[locale][0], answer: "", answers: [], diagnosis: null,
    messages: messages.slice(-30).filter(m => conversationMessageSchema.safeParse(m).success), generatingAt: null };
}
export function draftChanged(local: BuilderDraft, stored: BuilderDraft | null) {
  return Boolean(stored && (local.requestId !== stored.requestId || local.revision !== stored.revision));
}
