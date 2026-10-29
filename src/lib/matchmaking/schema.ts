import { countryCode, countryLabel, industryCode, industryLabel } from "@/lib/member-options";
import { z } from "zod";
import { insightSchema } from "@/lib/customer-insights/schema";
import { companyKey } from "@/lib/customer-insights/interviews";

export const ROLES = ["founder", "mentor", "investor", "partner", "buyer"] as const;
export const CATEGORIES = ["mentorship", "collaboration", "investors", "partners", "first-customers"] as const;
export const VISIBLE_FIELDS = ["country", "industry", "slogan", "companyPitch", "icp", "markets", "offers", "looksFor", "stats", "photo"] as const;
export const cardDraftSchema = z.object({
  role: z.enum(ROLES), categories: z.array(z.enum(CATEGORIES)).min(1).max(5).refine(v => new Set(v).size === v.length),
  country: z.string().trim().max(200), industry: z.string().trim().max(200), slogan: z.string().trim().max(500), offers: z.string().trim().max(2000), looksFor: z.string().trim().max(2000),
  visibleFields: z.array(z.enum(VISIBLE_FIELDS)).max(VISIBLE_FIELDS.length).refine(v => new Set(v).size === v.length),
}).strict();
export type CardDraft = z.infer<typeof cardDraftSchema>;
export const cardWriteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), revision: z.number().int().nonnegative(), requestId: z.string().uuid(), draft: cardDraftSchema }).strict(),
  z.object({ action: z.literal("publish"), revision: z.number().int().nonnegative(), requestId: z.string().uuid(), draft: cardDraftSchema, confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("hide"), revision: z.number().int().nonnegative(), requestId: z.string().uuid() }).strict(),
]);
export type CardWrite = z.infer<typeof cardWriteSchema>;
export function interviewCompanies(values: unknown[]) {
  return new Set(values.flatMap(value => {
    const parsed = insightSchema.safeParse(value);
    if (!parsed.success) return [];
    const v = parsed.data;
    return v.stage === "discover" && v.type === "Prospect" && v.company && (v.notes || v.answers.some(Boolean)) ? [companyKey(v.company)] : [];
  })).size;
}
export function activityGroup(at: string | Date | null, now = new Date()): "week" | "month" | "inactive" {
  const age = at ? now.getTime() - new Date(at).getTime() : Infinity;
  return age < 7 * 86400000 ? "week" : age < 30 * 86400000 ? "month" : "inactive";
}
const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function overlapReasons(viewer: { industry?: string | null; targetMarkets?: string[] } | null, card: { industry?: string; markets?: string[] }) {
  const reasons: ("industry" | "market")[] = [];
  if (viewer?.industry && card.industry && normalized(viewer.industry) === normalized(card.industry)) reasons.push("industry");
  if (viewer?.targetMarkets?.some(m => card.markets?.some(n => normalized(m) === normalized(n)))) reasons.push("market");
  return reasons;
}
export type CardSources = { companyName?: string | null; country?: string | null; industry?: string | null; oneLinePitch: string | null; icp: string | null; targetMarkets: string[] } | null;
export type CardStats = { interviews: number; payingCustomers: number | null; milestones: number };
export type PublicCard = {
  id: string; companyName?: string; role: CardDraft["role"]; categories: CardDraft["categories"]; country?: string; industry?: string; slogan?: string;
  companyPitch?: string; icp?: string; markets?: string[]; offers?: string; looksFor?: string; stats?: CardStats;
  photo?: string; activity: ReturnType<typeof activityGroup>; verified: boolean; recommended: boolean;
  reasons: ReturnType<typeof overlapReasons>;
};
// Build the whitelist explicitly: never spread a database member into a client response.
export function publicCard(row: CardDraft & { id: string; sourcePolicy?: number | null; revision?: number; blurredPhoto?: string | null; lastActiveAt: Date | null; verified: boolean; recommended: boolean }, source: CardSources, stats: CardStats, viewer: Parameters<typeof overlapReasons>[0], now = new Date(), restricted = false): PublicCard {
  const fields = new Set(row.visibleFields);
  const card: PublicCard = { id: row.id, role: row.role, categories: row.categories, activity: activityGroup(row.lastActiveAt, now), verified: row.verified && ["investor", "buyer"].includes(row.role), recommended: row.recommended, reasons: [] };
  for (const key of ["country", "industry", "slogan", "offers", "looksFor"] as const) if (fields.has(key)) card[key] = row[key];
  if (fields.has("companyPitch") && source?.oneLinePitch) card.companyPitch = source.oneLinePitch;
  if (fields.has("icp") && source?.icp) card.icp = source.icp;
  if (fields.has("markets") && source) card.markets = source.targetMarkets;
  if (fields.has("stats") && !restricted) card.stats = stats;
  if (row.sourcePolicy === 2 && source) {
    if (source.companyName) card.companyName = source.companyName;
    if (fields.has("country")) card.country = source.country || undefined;
    if (fields.has("industry")) card.industry = source.industry || undefined;
  }
  if (fields.has("photo") && row.blurredPhoto) card.photo = `/api/matchmaking/members/${row.id}/photo?v=${row.revision ?? 0}`;
  card.reasons = overlapReasons(viewer, card);
  return card;
}

export const listingSchema = z.object({
  q: z.string().trim().max(100).default(""), role: z.enum(["all", ...ROLES]).default("all"),
  category: z.enum(["all", ...CATEGORIES]).default("all"), country: z.string().max(2).refine(v => !v || countryCode(v) === v, "Invalid country").default(""),
  industry: z.enum(["", "saas", "hardware", "biotech", "consumer", "fintech", "other"]).default(""), page: z.coerce.number().int().min(1).max(10000).default(1),
});
export type CardFilters = z.infer<typeof listingSchema>;
export function matchesPublicCard(card: PublicCard, filters: Pick<CardFilters, "q" | "country" | "industry">) {
  if (filters.country && countryCode(card.country) !== filters.country) return false;
  if (filters.industry && industryCode(card.industry) !== filters.industry) return false;
  const haystack = [card.companyName, card.slogan, card.companyPitch, card.icp, card.offers, card.looksFor, card.industry, card.country,
    ...(card.industry ? [industryLabel(card.industry), industryLabel(card.industry, "zh-tw")] : []),
    ...(card.country && countryCode(card.country) ? [countryLabel(countryCode(card.country)!), countryLabel(countryCode(card.country)!, "zh-tw")] : []),
  ].filter(Boolean).join(" ").normalize("NFKC").toLowerCase();
  return filters.q.normalize("NFKC").toLowerCase().split(/\s+/).every(word => haystack.includes(word));
}
