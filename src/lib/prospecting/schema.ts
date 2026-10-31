import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/member-options";
import { publicWebsite, prospectKey } from "@/lib/validation/prospect-schema";

export class ProspectingError extends Error {
  constructor(message: string, public status = 409, public code = "prospecting_unavailable", public retryAfter = 0) { super(message); }
}
export const activeOrderStatuses = ["pending", "queued", "running", "checking", "reconciling"];
export const utcPeriod = (now = new Date()) => now.toISOString().slice(0, 7);
export const orderInputSchema = z.object({ requestId: z.string().uuid(), revision: z.number().int().nonnegative(), country: z.string().refine(v => COUNTRY_CODES.includes(v), "請選擇國家 / Select a country"), description: z.string().trim().min(10).max(4000), count: z.union([z.literal(5), z.literal(10)]) }).strict();
const httpsUrl = z.string().max(2000).refine(publicWebsite, "Public HTTPS source required");
export const evidenceSchema = z.object({ criterion: z.string().trim().min(1).max(4000), source_url: httpsUrl, observed_at: z.string().max(80).optional() });
export const providerCompanySchema = z.object({
  company_id: z.string().uuid(), name: z.string().trim().min(1).max(200), domain: z.string().max(253), website_url: httpsUrl, country_code: z.string().length(2),
  match_quality: z.enum(["strong", "possible"]), match_note: z.string().max(4000).nullable().optional(), researched_at: z.string().max(80),
  fit_evidence: z.array(evidenceSchema).min(1).max(30),
  contacts: z.object({
    emails: z.array(z.object({ value: z.email().max(254), kind: z.string().max(80).default("company_inbox"), status: z.string().max(80), source_url: httpsUrl })).max(30),
    people: z.array(z.object({ name: z.string().min(1).max(200), role: z.string().max(300).nullable().optional(), role_status: z.string().max(80), role_source_url: httpsUrl.nullable(), email: z.email().max(254).nullable(), email_status: z.string().max(80), email_source_url: httpsUrl.nullable() })).max(30).default([]),
  }),
});
export const publicProspectSchema = z.object({
  id: z.string().uuid(), name: z.string(), website: httpsUrl, country: z.string(), quality: z.enum(["strong", "possible"]), note: z.string().nullable(),
  evidence: z.array(evidenceSchema), researchedAt: z.string(),
  contact: z.object({ kind: z.enum(["email", "page"]), value: z.string(), source: httpsUrl, name: z.string().nullable(), role: z.string().nullable() }),
});
export type PublicProspect = z.infer<typeof publicProspectSchema>;
export type ProviderCompany = z.infer<typeof providerCompanySchema>;
export function uniqueProspects(companies: PublicProspect[], excluded: string[]) {
  const names = new Set(excluded.map(prospectKey).filter(Boolean)), ids = new Set<string>();
  const domains = new Set(excluded.flatMap(v => { try { return [new URL(v).hostname.replace(/^www\./, "")]; } catch { return []; } }));
  return companies.filter(c => {
    const name = prospectKey(c.name), host = new URL(c.website).hostname.replace(/^www\./, "");
    if (ids.has(c.id) || names.has(name) || [...domains].some(d => d === host || host.endsWith(`.${d}`) || d.endsWith(`.${host}`))) return false;
    ids.add(c.id); names.add(name); domains.add(host); return true;
  });
}
export const audienceDescription = (icp: { who?: string; problem?: string; summary?: string; stage?: string } | null) => [icp?.who && `Target buyers: ${icp.who}`, icp?.problem && `Buyer problem: ${icp.problem}`, icp?.stage && `Buyer stage: ${icp.stage}`, icp?.summary].filter(Boolean).join("\n").slice(0, 4000);
