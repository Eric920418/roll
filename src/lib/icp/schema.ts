import { z } from "zod";
import { COMPANY_STAGES } from "@/lib/action-plan/constants";

export const PRIMARY_NEEDS = ["paying-customers", "repeatable-sales", "fundraising", "expansion", "product-validation"] as const;
export const ICP_FIELDS = ["who", "stage", "location", "problem", "workaround", "channels"] as const;
export const icpDraftSchema = z.object({
  summary: z.string().trim().max(2000),
  who: z.string().trim().max(500),
  stage: z.string().trim().max(500),
  location: z.string().trim().max(500),
  problem: z.string().trim().max(500),
  workaround: z.string().trim().max(500),
  channels: z.string().trim().max(500),
}).strict();
export type IcpDraft = z.infer<typeof icpDraftSchema>;
export type IcpMessage = { role: "user" | "assistant"; content: string; topic?: number };
export const EMPTY_ICP: IcpDraft = { summary: "", who: "", stage: "", location: "", problem: "", workaround: "", channels: "" };
export function readIcp(value: unknown): IcpDraft | null {
  const parsed = icpDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function hasIcp(draft: IcpDraft): boolean {
  return Object.values(draft).some(Boolean);
}

// Fixed topics are chosen by the system: AI cannot repeat or invent follow-up questions.
const QUESTIONS = {
  en: [
    "Who needs what you are building most right now, and what problem are they facing?",
    "How do these customers handle that problem today, and where do you usually reach them?",
    "Which markets are these customers in, and what stage are they at? It is OK if you are not sure yet.",
  ],
  "zh-tw": [
    "目前最需要你產品的是誰？他們遇到的主要問題是什麼？",
    "這些客戶現在如何處理這個問題？你通常在哪裡接觸到他們？",
    "這些客戶位於哪些市場、處於什麼階段？還不確定也沒關係。",
  ],
};
export function nextIcpQuestion(draft: IcpDraft | null, messages: IcpMessage[], locale: "en" | "zh-tw"): IcpMessage | null {
  const asked = new Set(messages.filter(m => m.role === "assistant").map(m => m.topic));
  if (messages.filter(m => m.role === "user").length >= 3) return null;
  const missing = [!draft?.who || !draft?.problem, !draft?.workaround || !draft?.channels, !draft?.location || !draft?.stage];
  const topic = missing.findIndex((needed, index) => needed && !asked.has(index));
  if (topic < 0) return null;
  let content = QUESTIONS[locale][topic];
  if (topic === 2 && draft?.stage) content = locale === "zh-tw" ? "這些客戶位於哪些市場？還不確定也沒關係。" : "Which markets are these customers in? It is OK if you are not sure yet.";
  if (topic === 2 && draft?.location) content = locale === "zh-tw" ? "這些客戶目前處於什麼階段？還不確定也沒關係。" : "What stage are these customers at? It is OK if you are not sure yet.";
  return { role: "assistant", topic, content };
}

const nullableText = (max: number) => z.string().trim().max(max).nullable().transform(value => value || null).optional();
export const profilePatchSchema = z.object({
  companyName: nullableText(300),
  oneLinePitch: nullableText(500),
  companyStage: z.union([z.enum(COMPANY_STAGES), z.literal(""), z.null()]).transform(v => v || null).optional(),
  primaryNeed: z.union([z.enum(PRIMARY_NEEDS), z.literal(""), z.null()]).transform(v => v || null).optional(),
  industry: nullableText(100), companySize: nullableText(100), country: nullableText(200),
  website: z.union([z.string().trim().max(2000), z.null()]).transform((value, ctx) => {
    if (!value) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");
      return url.href;
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid website URL; use HTTP or HTTPS" });
      return z.NEVER;
    }
  }).optional(),
  needs: z.array(z.string().trim().max(100)).max(30).optional(),
  timeline: nullableText(100), budgetRange: nullableText(100), notes: nullableText(10000),
}).strict();

export type IcpWorkspaceView = {
  revision: number; profileVersion: number; currentProfileVersion: number;
  messages: IcpMessage[]; draft: IcpDraft | null; saved: IcpDraft | null; legacy: string | null;
  pending: boolean; error: string | null;
};

/** Server acknowledgement after a lost response: clear only the exact answer stored at its original slot. */
export function persistedIcpAnswer(workspace: IcpWorkspaceView, cached: unknown): boolean {
  if (!cached || typeof cached !== "object") return false;
  const input = cached as { text?: unknown; revision?: unknown; answerIndex?: unknown };
  if (typeof input.text !== "string" || !input.text || !Number.isInteger(input.revision) || !Number.isInteger(input.answerIndex)) return false;
  const revision = input.revision as number, index = input.answerIndex as number;
  const message = workspace.messages[index];
  return revision >= 0 && index >= 0 && workspace.revision > revision && message?.role === "user" && message.content === input.text.trim();
}
