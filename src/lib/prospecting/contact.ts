import "server-only";
import { get } from "node:https";
import { lookup } from "node:dns";
import { publicWebsite } from "@/lib/validation/prospect-schema";
import { publicProspectAddress } from "@/lib/validation/prospect-contact";
import { providerCompanySchema, type PublicProspect } from "./schema";
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");
const official = (url: string, website: string) => publicWebsite(url) && (host(url) === host(website) || host(url).endsWith(`.${host(website)}`));
const contactPath = (url: string) => /(?:contact|enquir|inquir|聯絡|聯繫|联系我们)/i.test(new URL(url).pathname + new URL(url).hash) && !/(?:privacy|legal|careers?|jobs?|terms)/i.test(new URL(url).pathname);
export async function readPublicPage(value: string, website: string): Promise<{ url: string; html: string } | null> {
  const signal = AbortSignal.timeout(7000); let url = value;
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!official(url, website)) return null;
    const page = await new Promise<{ status: number; location?: string; html?: string } | null>(resolve => {
      const request = get(url, { signal, family: 4, headers: { "User-Agent": "NOVA-Contact-Check/1.0", "Accept-Encoding": "identity" }, lookup: (hostname, _options, callback) => lookup(hostname, { family: 4, all: true }, (error, addresses) => {
        const address = addresses?.find(v => publicProspectAddress(v.address));
        callback(error || (!address ? new Error("Public address required") : null), address?.address || "", 4);
      }) }, result => {
        const status = result.statusCode || 0;
        if (status < 200 || status >= 300) { resolve({ status, location: result.headers.location }); result.destroy(); return; }
        if (!/text\/html|application\/xhtml\+xml/i.test(result.headers["content-type"] || "") || Number(result.headers["content-length"] || 0) > 262144) { result.destroy(); resolve(null); return; }
        const chunks: Buffer[] = []; let size = 0;
        result.on("data", chunk => { size += chunk.length; if (size > 262144) { result.destroy(); resolve(null); } else chunks.push(Buffer.from(chunk)); });
        result.on("end", () => resolve({ status, html: Buffer.concat(chunks).toString("utf8") }));
        result.on("error", () => resolve(null)); result.on("aborted", () => resolve(null));
      });
      request.on("error", () => resolve(null));
    });
    if (!page) return null;
    if (page.html !== undefined) return { url, html: page.html };
    if (![301, 302, 303, 307, 308].includes(page.status) || !page.location) return null;
    try { url = new URL(page.location, url).href; } catch { return null; }
  }
  return null;
}
function text(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_, hex, dec) => { const n = parseInt(hex || dec, hex ? 16 : 10); return n <= 0x10ffff ? String.fromCodePoint(n) : ""; }).replace(/&commat;/gi, "@").replace(/&period;/gi, ".");
}
export async function verifyCompany(raw: unknown, country: string, read = readPublicPage): Promise<{ company?: PublicProspect; rejection?: string }> {
  const parsed = providerCompanySchema.safeParse(raw);
  if (!parsed.success) return { rejection: "invalid_fields" };
  const c = parsed.data;
  if (c.country_code !== country) return { rejection: "wrong_country" };
  if (c.domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") !== host(c.website_url)) return { rejection: "domain_mismatch" };
  const routes = [
    ...c.contacts.people.filter(p => p.email && p.email_status === "published" && p.email_source_url).map(p => ({ email: p.email!, url: p.email_source_url!, name: p.role_status === "published" ? p.name : null, role: p.role_status === "published" ? p.role || null : null })),
    ...c.contacts.emails.filter(e => e.status === "published").map(e => ({ email: e.value, url: e.source_url, name: null, role: null })),
  ].filter(r => official(r.url, c.website_url));
  const urls = [...new Set([...routes.map(r => r.url), ...c.fit_evidence.filter(e => official(e.source_url, c.website_url) && contactPath(e.source_url)).map(e => e.source_url), c.website_url])].slice(0, 2);
  const pages = new Map<string, { url: string; html: string }>();
  for (const url of urls) { const page = await read(url, c.website_url); if (page) pages.set(url, page); }
  let contact: PublicProspect["contact"] | undefined;
  for (const route of routes) {
    const page = pages.get(route.url); if (!page) continue;
    const published = text(page.html).match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    if (published.some(v => v.toLowerCase() === route.email.toLowerCase())) { contact = { kind: "email", value: route.email, source: page.url, name: route.name, role: route.role }; break; }
  }
  const qualifies = (page: { url: string; html: string }) => contactPath(page.url) && /<form\b|mailto:|tel:/i.test(page.html);
  if (!contact) {
    let page = [...pages.values()].find(qualifies);
    if (!page) {
      const homepage = pages.get(c.website_url);
      const links = homepage ? [...homepage.html.matchAll(/href\s*=\s*["']([^"']{1,2000})["']/gi)].slice(0, 100).flatMap(m => { try { const u = new URL(m[1], homepage.url).href; return official(u, c.website_url) && contactPath(u) ? [u] : []; } catch { return []; } }) : [];
      if (links[0] && !pages.has(links[0])) { const fetched = await read(links[0], c.website_url); if (fetched && qualifies(fetched)) page = fetched; }
    }
    if (page) contact = { kind: "page", value: page.url, source: page.url, name: null, role: null };
  }
  if (!contact) return { rejection: "no_verified_contact" };
  return { company: { id: c.company_id, name: c.name, website: c.website_url, country: c.country_code, quality: c.match_quality, note: c.match_note || null, evidence: c.fit_evidence, researchedAt: c.researched_at, contact } };
}
