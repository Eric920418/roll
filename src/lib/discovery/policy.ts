import { z } from "zod";
import { interviewSummary, companyKey, type InterviewRow } from "@/lib/customer-insights/interviews";
import { insightSchema } from "@/lib/customer-insights/schema";

export const DISCOVERY_POLICY = "interviews-3-v1";
export const TRIAL_INTERVIEWS = 3;
export const FULL_INTERVIEWS = 10;
export const TRIAL_DAYS = 14;
export const FOUNDER_SEATS = 10;
export const FOUNDER_AMOUNT = "348.00";

export function newDiscoveryTrial(now = new Date()) {
  if (process.env.DISCOVERY_TRIAL_ENABLED !== "true") return {};
  return { trialPolicy: DISCOVERY_POLICY, trialPlan: "pro", trialStartsAt: now, trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000) };
}
export function isDiscoveryMember(account: { trialPolicy?: string | null } | null) { return account?.trialPolicy === DISCOVERY_POLICY; }
export function discoveryTrialActive(account: { trialStartsAt: Date | null; trialEndsAt: Date | null }, now = new Date()) {
  return !!account.trialStartsAt && !!account.trialEndsAt && account.trialStartsAt <= now && account.trialEndsAt > now;
}
export function founderAccessEndsAt(paidAt: Date) {
  const end = new Date(paidAt);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  if (end.getUTCMonth() !== paidAt.getUTCMonth()) end.setUTCDate(0);
  return end;
}
export function discoveryEvidence(journeyId: string, rows: InterviewRow[]) {
  const selected = rows.flatMap(row => {
    const parsed = insightSchema.safeParse(row.insight);
    if (!parsed.success || parsed.data.journeyId !== journeyId) return [];
    const value = { ...parsed.data, actionId: journeyId }; delete value.journeyId;
    return [{ ...row, insight: value }];
  });
  const summary = interviewSummary(journeyId, selected);
  return summary.companies.map(company => {
    const row = selected.find(value => value.id === company.recordId)!;
    return { id: row.id, company: company.name, key: companyKey(company.name), texts: [...row.insight.answers, row.insight.notes].filter(Boolean) };
  });
}
export const discoveryAnalysisSchema = z.object({
  topics: z.array(z.object({ label: z.string().trim().min(1).max(120), evidence: z.array(z.object({ recordId: z.string().min(1), quote: z.string().trim().min(1).max(800) })).min(1).max(10) })).max(3),
  nextMoves: z.array(z.string().trim().min(1).max(500)).max(3),
}).strict();
export function groundedDiscoveryAnalysis(raw: unknown, evidence: ReturnType<typeof discoveryEvidence>, full: boolean) {
  const parsed = discoveryAnalysisSchema.parse(raw);
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const topics = parsed.topics.map(topic => {
    const companies = new Set<string>();
    for (const reference of topic.evidence) {
      const source = evidence.find(value => value.id === reference.recordId);
      if (!source || !source.texts.some(text => normalize(text).includes(normalize(reference.quote)))) throw new Error("分析引用與訪談不符，請重試 / Analysis quote does not match saved evidence; retry");
      companies.add(source.key);
    }
    return { ...topic, count: companies.size, percent: evidence.length ? Math.round(companies.size / evidence.length * 1000) / 10 : 0 };
  }).sort((a, b) => b.count - a.count);
  return { total: evidence.length, topics: full ? topics : topics.filter(topic => topic.count >= 2).slice(0, 1), nextMoves: full ? parsed.nextMoves : [] };
}

export const discoveryReportSchema = z.object({ total: z.number().int().nonnegative(), generatedAt: z.iso.datetime(), nextMoves: z.array(z.string()), topics: z.array(z.object({ label: z.string(), count: z.number().int().nonnegative(), percent: z.number().min(0).max(100), evidence: z.array(z.object({ recordId: z.string(), quote: z.string() })) })) });
