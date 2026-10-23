import { z } from "zod";

// Ignore spacing, punctuation and common legal suffixes when excluding known companies.
export function prospectKey(name: string) {
  return name.normalize("NFKC").toLowerCase().replace(/(?:股份有限公司|有限公司|有限会社|\b(?:co|ltd|inc|corp|corporation|limited)\b\.?)/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}
export function publicWebsite(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !/^(?:localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|[\d.]+)$/.test(u.hostname.replace(/\.$/, "")) && u.hostname.includes(".");
  } catch { return false; }
}
const url = z.string().max(2000).refine(publicWebsite, "Public HTTPS website required");
const citation = z.object({ url, quote: z.string().trim().min(1).max(1000) }).strict();
const contactSchema = z.object({ kind: z.enum(["page", "email"]), value: z.string().trim().min(1).max(2000), source: citation }).strict().refine(c => c.kind === "page" ? publicWebsite(c.value) : c.value.length <= 254 && z.email().safeParse(c.value).success, "Valid public contact page or email required");
export const prospectShortlistSchema = z.object({ candidates: z.array(z.object({ name: z.string().trim().min(1).max(200), urls: z.array(url).min(1).max(4) }).strict()).max(16) }).strict();
export const prospectCompanySchema = z.object({
  name: z.string().trim().min(1).max(200), aliases: z.array(z.string().trim().min(1).max(200)).max(5),
  website: url, reason: z.string().trim().min(1).max(1000),
  taiwan: citation, fit: citation, contact: contactSchema.optional(),
}).strict();
export const prospectSelectionSchema = z.object({ companies: z.array(prospectCompanySchema.omit({ taiwan: true, fit: true, contact: true }).extend({ taiwanSource: z.number().int().nonnegative(), fitSource: z.number().int().nonnegative(), contact: z.object({ kind: z.enum(["page", "email"]), value: z.string().trim().min(1).max(2000), source: z.number().int().nonnegative() }).strict() })).max(10) }).strict();
export const prospectResultSchema = z.object({ companies: z.array(prospectCompanySchema).max(10) }).strict();
export const prospectReportSchema = prospectResultSchema.extend({ requested: z.union([z.literal(6), z.literal(10)]), generatedAt: z.iso.datetime() });
export const prospectCacheSchema = z.object({ prospects: z.record(z.string(), z.object({ source: z.string(), result: prospectReportSchema })).default({}), prospectPending: z.object({ token: z.string(), since: z.iso.datetime() }).optional() }).passthrough();
export type ProspectCompany = z.infer<typeof prospectCompanySchema>;
export function excludeKnownCompanies(companies: ProspectCompany[], excluded: string[]) {
  const seen = new Set(excluded.map(prospectKey).filter(Boolean)), domains = new Set<string>(excluded.flatMap(value => { try { return [new URL(value).hostname.replace(/^www\./, "")]; } catch { return []; } }));
  return companies.filter(c => {
    const keys = [c.name, ...c.aliases].map(prospectKey).filter(Boolean), host = new URL(c.website).hostname.replace(/^www\./, "");
    if (keys.some(k => seen.has(k)) || domains.has(host)) return false;
    keys.forEach(k => seen.add(k)); domains.add(host); return true;
  });
}
export const taiwanEvidence = (text: string) => /taiwan|taipei|taichung|tainan|kaohsiung|hsinchu|taoyuan|keelung|chiayi|changhua|yunlin|miaoli|nantou|pingtung|yilan|hualien|taitung|penghu|kinmen|lienchiang|台灣|臺灣|台北|臺北|新北|台中|臺中|台南|臺南|高雄|新竹|桃園|基隆|嘉義|彰化|雲林|苗栗|南投|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江/i.test(text);
export function groundedProspects(raw: unknown, sources: { url: string; quote: string }[], excluded: string[], count: 6 | 10, rejected: Record<string, number> = {}) {
  const reject = (reason: string) => { rejected[reason] = (rejected[reason] || 0) + 1; return false; };
  const parsed = z.object({ companies: z.array(z.unknown()).max(16) }).strict().parse(raw);
  const valid = parsed.companies.flatMap(value => { const result = prospectCompanySchema.safeParse(value); if (!result.success) reject("invalid_fields"); return result.success ? [result.data] : []; });
  const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  const eligible = valid.filter(c => {
    const host = new URL(c.website).hostname.replace(/^www\./, "");
    const ownDomain = (value: string) => { const h = new URL(value).hostname.replace(/^www\./, ""); return h === host || h.endsWith(`.${host}`); };
    const named = (text: string) => [c.name, ...c.aliases].some(n => prospectKey(n).length >= 3 && prospectKey(text).includes(prospectKey(n)));
    const government = (ref: { url: string; quote: string }) => new URL(ref.url).hostname.endsWith(".gov.tw") && named(ref.quote);
    const contact = c.contact;
    if (!contact || !ownDomain(contact.source.url)) return reject("contact_not_official");
    if (/(?:^|[/#_-])(?:privacy|legal|careers?|jobs?|recruitment|terms)(?:$|[/#_-])/i.test(new URL(contact.source.url).pathname)) return reject("specialist_contact");
    const contactValue = contact.value.toLowerCase();
    if (contact.kind === "page") {
      if (!publicWebsite(contact.value) || contact.value !== contact.source.url) return reject("contact_url_mismatch");
      const path = new URL(contact.value).pathname + new URL(contact.value).hash;
      const contactPath = /(?:^|[/#])(?:contact(?:[-_]?us)?|contacts|enquir(?:y|ies)|inquir(?:y|ies)|聯絡(?:我們)?|聯繫(?:我們)?|联系我们)(?:[/.#_-]|$)/i.test(path);
      const contactQuote = /contact\s+(?:us|our|team|sales)|business\s+(?:inquir|enquir)|sales\s+(?:inquir|enquir)|聯絡|聯繫|洽詢|業務諮詢/i.test(contact.source.quote);
      if (path === "/" || !(contactPath || contactQuote)) return reject("not_contact_page");
    } else {
      const emails = contact.source.quote.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
      if (!z.email().safeParse(contact.value).success || !emails.some(e => e.toLowerCase() === contactValue) || /^(?:no.?reply|privacy|dpo|abuse|security|jobs|careers|legal)@/i.test(contact.value)) return reject("email_not_published");
    }
    if (![c.taiwan, c.fit, contact.source].every(ref => sources.some(s => s.url === ref.url && normalize(s.quote).includes(normalize(ref.quote))))) return reject("quote_not_found");
    if (![c.taiwan, c.fit].every(ref => ownDomain(ref.url) || government(ref))) return reject("source_not_official");
    if (![c.taiwan, c.fit].some(ref => ownDomain(ref.url)) && !sources.some(s => ownDomain(s.url) && named(s.quote))) return reject("website_not_established");
    return taiwanEvidence(c.taiwan.quote) || reject("missing_taiwan");
  });
  const fresh = excludeKnownCompanies(eligible, excluded);
  if (eligible.length > fresh.length) rejected.known_or_duplicate = eligible.length - fresh.length;
  return fresh.slice(0, count);
}

export function prospectResearchBatches(raw: unknown, pages: { url: string; title: string }[], excluded: string[], count: 6 | 10) {
  const known = new Set(excluded.map(prospectKey));
  const allowed = new Map(pages.filter(p => publicWebsite(p.url)).map(p => [new URL(p.url).href, p.url]));
  const candidates = [...(prospectShortlistSchema.safeParse(raw).data?.candidates || []), ...pages.map(p => ({ name: p.title, urls: [p.url] }))];
  const blockedDomains = new Set(excluded.flatMap(value => publicWebsite(value) ? [new URL(value).hostname.replace(/^www\./, "")] : []));
  for (const c of candidates) if (known.has(prospectKey(c.name))) for (const value of c.urls) if (publicWebsite(value)) blockedDomains.add(new URL(value).hostname.replace(/^www\./, ""));
  const seen = new Set<string>();
  const accepted = candidates.flatMap(c => {
    if (known.has(prospectKey(c.name))) return [];
    const urls = [...new Set(c.urls.flatMap(u => {
      if (!publicWebsite(u)) return [];
      const exact = allowed.get(new URL(u).href);
      const host = new URL(u).hostname.replace(/^www\./, "");
      return (exact ? [exact] : pages.filter(p => publicWebsite(p.url) && new URL(p.url).hostname.replace(/^www\./, "") === host).map(p => p.url)).filter(p => !/\.pdf(?:[?#]|$)/i.test(p));
    }))].slice(0, 4);
    if (!urls.length) return [];
    const host = new URL(urls[0]!).hostname.replace(/^www\./, "");
    if (seen.has(host) || blockedDomains.has(host)) return []; seen.add(host);
    return [{ name: c.name, urls }];
  }).slice(0, count === 6 ? 9 : 12);
  return Array.from({ length: Math.ceil(accepted.length / 3) }, (_, i) => accepted.slice(i * 3, i * 3 + 3));
}

// Repair source selection using actual same-company evidence, never invented contact data.
export function resolveProspectEvidence(company: ProspectCompany, sources: { url: string; quote: string }[]): ProspectCompany {
  const host = new URL(company.website).hostname.replace(/^www\./, "");
  const official = sources.filter(s => { if (!publicWebsite(s.url)) return false; const h = new URL(s.url).hostname.replace(/^www\./, ""); return h === host || h.endsWith(`.${host}`); });
  const resolved = { ...company, taiwan: official.find(s => taiwanEvidence(s.quote)) || company.taiwan };
  const routes: NonNullable<ProspectCompany["contact"]>[] = [
    ...(company.contact ? [company.contact] : []),
    ...official.map(source => ({ kind: "page" as const, value: source.url, source })),
    ...official.flatMap(source => (source.quote.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map(value => ({ kind: "email" as const, value, source }))),
  ];
  for (const contact of routes) {
    const valid = groundedProspects({ companies: [{ ...resolved, contact }] }, sources, [], 6);
    if (valid.length) return valid[0]!;
  }
  return resolved;
}
