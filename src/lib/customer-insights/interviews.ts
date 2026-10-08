import { insightSchema, CHALLENGES } from "./schema";

export type InterviewRow = { id: string; updatedAt: string | Date; insight: unknown };
export function companyKey(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
export function interviewSummary(actionId: string, rows: InterviewRow[]) {
  const companies = new Map<string, { name: string; challenge: keyof typeof CHALLENGES | "unclassified"; recordId: string }>();
  for (const row of [...rows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id.localeCompare(a.id))) {
    const parsed = insightSchema.safeParse(row.insight);
    if (!parsed.success) continue;
    const v = parsed.data, key = companyKey(v.company);
    if (v.actionId !== actionId || !key || !(v.answers.some(Boolean) || v.notes) || companies.has(key)) continue;
    companies.set(key, { name: v.company, challenge: v.challenge ?? "unclassified", recordId: row.id });
  }
  const counts = { market: 0, focus: 0, survival: 0, other: 0, unclassified: 0 };
  for (const company of companies.values()) counts[company.challenge]++;
  const total = companies.size;
  const top = (["market", "focus", "survival"] as const).map(key => ({ key, count: counts[key], percent: total ? Math.round(counts[key] / total * 1000) / 10 : 0 }))
    .filter(row => row.count > 0).sort((a, b) => b.count - a.count);
  return { total, top, counts, companies: [...companies.values()] };
}

export type InterviewSummary = ReturnType<typeof interviewSummary>;
