import { z } from "zod";
import { EMPTY_ICP, type IcpDraft } from "./schema";
export const guessSchema = z.object({ customer: z.string().trim().max(500), struggle: z.string().trim().max(500), situation: z.string().trim().max(500), workaround: z.string().trim().max(500) }).strict();
export type IcpGuess = z.infer<typeof guessSchema>;
export const EMPTY_GUESS: IcpGuess = { customer: "", struggle: "", situation: "", workaround: "" };
export const discoveryInputSchema = z.object({ mode: z.enum(["suggest", "sharpen", "synthesize"]), product: z.string().trim().max(600).default(""), guess: guessSchema.default(EMPTY_GUESS) }).strict().superRefine((v, ctx) => {
  if (v.mode === "suggest" && v.product.length < 10) ctx.addIssue({ code: "custom", path: ["product"], message: "Please describe your product (at least 10 characters) / 請至少用 10 個字描述產品" });
  if (v.mode === "sharpen" && !v.guess.customer && !v.guess.struggle) ctx.addIssue({ code: "custom", path: ["guess"], message: "Describe a customer or their problem / 請填寫客戶或問題" });
});
const candidateSchema = z.object({ name: z.string().trim().min(3).max(300), whyFirst: z.string().trim().min(1).max(800), whereToFind: z.array(z.string().min(1).max(200)).min(1).max(5), reach: z.enum(["easy", "some_effort", "hard"]), assumptionToTest: z.string().trim().min(1).max(800), guess: guessSchema }).strict();
export const discoveryResultSchema = z.object({
  message: z.string().trim().min(1).max(1500), question: z.string().trim().max(500),
  candidates: z.array(candidateSchema).max(3),
  guess: guessSchema.nullable(),
  patterns: z.array(z.object({ text: z.string().trim().min(1).max(800), evidence: z.array(z.object({ id: z.string(), quote: z.string().min(1).max(1000) }).strict()).min(2).max(10) }).strict()).max(4),
  unclear: z.array(z.string().trim().max(500)).max(8),
}).strict();
export type DiscoveryInput = z.infer<typeof discoveryInputSchema>;
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
export type DiscoveryState = { path: "guess" | "suggest" | "discovery"; guess?: IcpGuess; input?: DiscoveryInput; result?: DiscoveryResult };
export const discoveryStateSchema = z.object({ path: z.enum(["guess", "suggest", "discovery"]), guess: guessSchema.optional(), input: discoveryInputSchema.optional(), result: discoveryResultSchema.optional() }).strict();
export function guessToIcp(guess: IcpGuess, base: IcpDraft = EMPTY_ICP): IcpDraft {
  return { ...base, summary: [guess.customer, guess.struggle, guess.situation, guess.workaround].filter(Boolean).join(" · ").slice(0, 2000), who: guess.customer, problem: guess.struggle, workaround: guess.workaround };
}
export function validateDiscoveryResult(raw: unknown, mode: DiscoveryInput["mode"], conversations: { id: string; body: string }[] = [], excluded: string[] = []): DiscoveryResult {
  const result = discoveryResultSchema.parse(raw);
  if (mode === "suggest") {
    if (!result.question && result.candidates.length < 2) throw new Error("Need a clarification or 2–3 candidates");
    if (result.question && result.candidates.length) throw new Error("Ask a question or suggest candidates, not both");
    const names = result.candidates.map(c => c.name.normalize("NFKC").toLowerCase());
    if (new Set(names).size !== names.length || names.some(name => excluded.some(old => old.normalize("NFKC").toLowerCase() === name))) throw new Error("Repeated candidates");
  }
  if (mode === "synthesize") {
    if (conversations.length < 5) throw new Error("Five saved customer conversations required");
    if (!result.guess || result.patterns.length < 2) throw new Error("Need an evidence-backed draft and patterns");
    const normalized = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
    for (const pattern of result.patterns) {
      if (new Set(pattern.evidence.map(e => e.id)).size < 2) throw new Error("A pattern needs two different conversations");
      for (const e of pattern.evidence) if (!conversations.some(c => c.id === e.id && normalized(c.body).includes(normalized(e.quote)))) throw new Error("Unsupported conversation evidence");
    }
  }
  return result;
}
