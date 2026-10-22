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
export const prospectCompanySchema = z.object({
  name: z.string().trim().min(1).max(200), aliases: z.array(z.string().trim().min(1).max(200)).max(5),
  website: url, reason: z.string().trim().min(1).max(1000),
  taiwan: citation, fit: citation,
}).strict();
export const prospectSelectionSchema = z.object({ companies: z.array(prospectCompanySchema.omit({ taiwan: true, fit: true }).extend({ taiwanSource: z.number().int().nonnegative(), fitSource: z.number().int().nonnegative() })).max(10) }).strict();
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
export function groundedProspects(raw: unknown, sources: { url: string; quote: string }[], excluded: string[], count: 6 | 10) {
  const parsed = prospectResultSchema.parse(raw);
  const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  return excludeKnownCompanies(parsed.companies.filter(c => {
    const host = new URL(c.website).hostname.replace(/^www\./, "");
    const ownDomain = (value: string) => { const h = new URL(value).hostname.replace(/^www\./, ""); return h === host || h.endsWith(`.${host}`); };
    const named = (text: string) => [c.name, ...c.aliases].some(n => prospectKey(n).length >= 3 && prospectKey(text).includes(prospectKey(n)));
    const government = (ref: { url: string; quote: string }) => new URL(ref.url).hostname.endsWith(".gov.tw") && named(ref.quote);
    return [c.taiwan, c.fit].every(ref => sources.some(s => s.url === ref.url && normalize(s.quote).includes(normalize(ref.quote))))
      && [c.taiwan, c.fit].every(ref => ownDomain(ref.url) || government(ref))
      && ([c.taiwan, c.fit].some(ref => ownDomain(ref.url)) || sources.some(s => ownDomain(s.url) && named(s.quote)))
      && taiwanEvidence(c.taiwan.quote);
  }), excluded).slice(0, count);
}
