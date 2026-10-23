import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import ts from "typescript";
import { excludeKnownCompanies, groundedProspects, prospectCompanySchema, prospectKey, publicWebsite, taiwanEvidence, prospectResearchBatches, prospectSources, prospectCacheSchema, resolveProspectEvidence, readProspectSelection } from "../src/lib/validation/prospect-schema";

const company = (name: string, domain = "new.example.com") => ({ name, aliases: [] as string[], website: `https://${domain}`, reason: "Potential ICP fit; confirm with outreach", taiwan: { url: `https://${domain}/about`, quote: "Taipei, Taiwan" }, fit: { url: `https://${domain}/about`, quote: "B2B software" }, contact: { kind: "page" as const, value: `https://${domain}/contact`, source: { url: `https://${domain}/contact`, quote: "Contact our business team" } } });
test("A single encoded tool array or envelope is decoded without accepting broken, oversized or extra data", () => {
  const rows = [{ name: "Candidate still requires full evidence validation" }];
  for (const companies of [rows, JSON.stringify(rows), JSON.stringify({ companies: rows })]) assert.deepEqual(readProspectSelection({ companies }), rows);
  for (const raw of [{}, { companies: "bad JSON" }, { companies: JSON.stringify({ companies: rows, invented: true }) }, { companies: JSON.stringify({ companies: JSON.stringify(rows) }) }, { companies: Array(17).fill({}) }, { companies: " ".repeat(100001) }, { companies: rows, invented: true }]) assert.throws(() => readProspectSelection(raw));
});
test("Source limits retain the business summary, footer Taiwan address and published email instead of only navigation", () => {
  const url = "https://new.example.com/contact";
  const collected = ["B2B software for logistics", ...Array.from({ length: 150 }, (_, i) => `Navigation item ${i}`), "Taipei, Taiwan 110", "Business enquiries: hello@new.example.com", "Business   enquiries: hello@new.example.com", "Contact our team"].map(quote => ({ url, quote }));
  const sources = prospectSources(collected);
  assert.equal(sources.length, 6);
  assert(sources.some(s => s.quote === "B2B software for logistics"));
  assert(sources.some(s => s.quote === "Taipei, Taiwan 110"));
  assert.equal(sources.filter(s => s.quote.includes("hello@new.example.com")).length, 1);
  assert(sources.every(s => collected.some(c => c.url === s.url && c.quote === s.quote)));
});
test("Prospect exclusions normalize Unicode, legal suffixes, punctuation and aliases without substring overblocking", () => {
  assert.equal(prospectKey(" ＣｉｒｃｌｅＷｅ Co., Ltd. "), prospectKey("CircleWe"));
  assert.equal(prospectKey("EV Rapid Force Inc."), prospectKey("EV Rapid Force"));
  assert.equal(prospectKey("台灣示範股份有限公司"), prospectKey("台灣示範"));
  const known = ["CircleWe", "EV Rapid Force", "Other Name", "https://www.own.example.com"];
  const companies = [company("Circle We"), company("EV-Rapid-Force", "ev.example.com"), { ...company("新品牌", "alias.example.com"), aliases: ["Other Name Ltd."] }, company("Different Name", "own.example.com"), company("New Company", "new.example.com"), company("New Company 2", "new.example.com"), company("Circle Ventures", "circle.example.com")];
  assert.deepEqual(excludeKnownCompanies(companies, known).map(v => v.name), ["New Company", "Circle Ventures"]);
  assert.deepEqual(excludeKnownCompanies([company("New brand", "portal.own.example.com"), company("Similar domain", "notown.example.com")], ["https://own.example.com"]).map(c => c.name), ["Similar domain"]);
  assert.equal(excludeKnownCompanies([company("Parent brand", "own.example.com")], ["https://portal.own.example.com"]).length, 0);
});
test("Only officially cited Taiwan prospects qualify, fewer than requested is valid; invalid or ungrounded data never fills quotas", () => {
  const valid = company("Real"), other = company("Other", "other.example.com");
  const sources = [{ url: valid.taiwan.url, quote: "Based in Taipei, Taiwan. B2B software" }, valid.contact.source];
  assert.deepEqual(groundedProspects({ companies: [valid, other] }, sources, [], 6), [valid]);
  assert.deepEqual(groundedProspects({ companies: [valid] }, sources, ["Real"], 10), []);
  assert.deepEqual(groundedProspects({ companies: [{ ...valid, taiwan: { ...valid.taiwan, quote: "Taiwan invented" } }] }, sources, [], 6), []);
  assert.deepEqual(groundedProspects({ companies: [{ ...valid, website: "https://fake.example.com" }] }, sources, [], 6), []);
  assert.equal(groundedProspects({ companies: [{ ...valid, website: "https://example.com" }] }, sources, [], 6).length, 1, "Official subdomains can support a corporate website");
  const gov = { url: "https://startup.sme.gov.tw/company/real", quote: "Real is a B2B software company operating in Taipei, Taiwan" };
  const govCompany = { ...valid, taiwan: gov, fit: gov };
  const govSources = [gov, { url: valid.website, quote: "Real official software website" }, valid.contact.source];
  assert.equal(groundedProspects({ companies: [govCompany] }, govSources, [], 6).length, 1);
  assert.equal(groundedProspects({ companies: [{ ...govCompany, name: "Not Real Company" }] }, govSources, [], 6).length, 0);
  assert.equal(groundedProspects({ companies: [{ ...govCompany, website: "https://invented.example.com" }] }, govSources, [], 6).length, 0);
  const directory = { url: "https://directory.example.com/companies/real", quote: "Real provides B2B software" };
  assert.equal(groundedProspects({ companies: [{ ...valid, fit: directory }] }, [...sources, directory], [], 6).length, 1, "A named public business profile can support fit while Taiwan and contact remain official");
  assert.equal(groundedProspects({ companies: [{ ...valid, fit: { ...directory, quote: "Other Company provides B2B software" } }] }, [...sources, { ...directory, quote: "Other Company provides B2B software" }], [], 6).length, 0);
  const noTaiwan = { ...valid, taiwan: { ...valid.taiwan, quote: "B2B software" } };
  assert.deepEqual(groundedProspects({ companies: [noTaiwan] }, sources, [], 6), []);
  assert.deepEqual(groundedProspects({ companies: [{ ...valid, invented: "field" }] }, sources, [], 6), []);
  assert.equal(groundedProspects({ companies: [{ ...valid, invented: "field" }, valid] }, sources, [], 6).length, 1, "A malformed company must not discard valid companies");
  assert.equal(prospectCompanySchema.safeParse({ ...valid, website: "javascript:alert(1)" }).success, false);
  for (const url of ["http://example.com", "https://localhost/", "https://localhost./", "https://127.0.0.1/", "https://[::1]/", "https://user:pass@example.com/", "https://x.internal/", "https://example.com:8443/"]) assert.equal(publicWebsite(url), false, url);
  assert(publicWebsite("https://www.example.com/about"));
  for (const city of ["Taoyuan", "Tainan", "Hualien", "台東", "嘉義", "新北"]) assert(taiwanEvidence(city), city);
  assert.equal(taiwanEvidence("Singapore"), false);
});


test("New-company discovery and existing follow-up have distinct bilingual labels without mislabelling added companies as interviewed", () => {
  const require = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync("src/components/dashboard/ValidationWorkspace.tsx", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const locale of ["zh-tw", "en"]) {
    let cursor = 0;
    const existing = { company: "CircleWe", name: "Contact", sourceId: "note-1", quote: "Pain", amount: "", currency: "", willingness: "not_asked", heat: "unknown", respondedAt: "" };
    const snapshot = { source: "ui-source", rows: [], prospects: { [`6:${locale}`]: { companies: [company("New Taiwan Buyer")], stale: false } }, priority: [existing, { ...existing, company: "Saved Lead", sourceId: undefined }], summary: { total: 0, paid: 0, signed: 0, amounts: {} }, deals: [], tasks: [], analysis: null };
    const loaded = { exports: {} as { default: (props: object) => ReactNode } };
    runInNewContext(code, {
      module: loaded, exports: loaded.exports,
      require: (id: string) => {
        if (id === "react") return { useEffect() {}, useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn, useState: (initial: unknown) => [cursor++ === 0 ? snapshot : initial, () => {}] };
        if (id === "next-intl") return { useLocale: () => locale };
        if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
        if (id === "@vercel/blob/client") return { upload() { throw new Error("Unexpected upload"); } };
        if (id === "./PlanRefresh") return { notifyPlanChanged() {} };
        return require(id.startsWith("@/") ? `../src/${id.slice(2)}` : id);
      },
    });
    const html = renderToStaticMarkup(loaded.exports.default({ userId: "ui-only", journeyId: "ui-only" }));
    const zh = locale === "zh-tw";
    const discovery = html.indexOf(zh ? 'aria-label="新公司開發"' : 'aria-label="Discover new companies"');
    const followup = html.indexOf(zh ? 'aria-label="既有公司跟進"' : 'aria-label="Follow up existing companies"');
    assert(discovery >= 0 && followup > discovery);
    const newList = html.slice(discovery, followup);
    assert(newList.includes("New Taiwan Buyer") && !newList.includes("CircleWe"));
    assert(newList.includes(zh ? "新推薦 · 平台內無紀錄" : "New prospect · No saved records"));
    assert(newList.includes(zh ? "開啟官方聯絡頁" : "Open official contact page"));
    assert(newList.includes('href="https://new.example.com/contact"'));
    assert(newList.includes(zh ? "平台外是否接觸過" : "outside NOVA"));
    const existingList = html.slice(followup, html.indexOf(zh ? "訪談證據分析" : "Interview evidence analysis"));
    assert(existingList.includes("CircleWe") && existingList.includes("Saved Lead") && !existingList.includes("New Taiwan Buyer"));
    assert.equal(existingList.split(zh ? "已有訪談紀錄" : "Interview recorded").length - 1, 1);
    assert.equal(existingList.split(zh ? "已加入跟進" : "Saved for follow-up").length - 1, 1);
    assert(existingList.includes(zh ? "查看紀錄／繼續跟進" : "View records / continue follow-up"));
  }
});


test("Public contact routes require exact official evidence; homepages, fabricated emails and specialist inboxes do not qualify", () => {
  const value = company("Reachable");
  const base = [{ url: value.taiwan.url, quote: "Taipei, Taiwan. B2B software" }];
  const check = (contact: unknown, source?: { url: string; quote: string }) => groundedProspects({ companies: [{ ...value, contact }] }, [...base, ...(source ? [source] : [])], [], 6);
  assert.equal(check(value.contact, value.contact.source).length, 1);
  assert.equal(check(undefined).length, 0);
  assert.equal(check({ ...value.contact, value: "https://other.example.com/contact" }, value.contact.source).length, 0);
  assert.equal(prospectCompanySchema.safeParse({ ...value, contact: { ...value.contact, value: "javascript:alert(1)" } }).success, false);
  const about = { url: `${value.website}/about`, quote: "Our business software in Taiwan" };
  assert.equal(check({ kind: "page", value: about.url, source: about }, about).length, 0, "Business descriptions alone are not contact routes");
  const navigation = { url: `${value.website}/success-stories/customer`, quote: "Contact us: https://new.example.com/contact-en" };
  assert.equal(check({ kind: "page", value: navigation.url, source: navigation }, navigation).length, 0, "An article's contact navigation is not an actual contact page");
  const form = { url: `${value.website}/get-started`, quote: "Send us a message using the contact form" };
  assert.equal(check({ kind: "page", value: form.url, source: form }, form).length, 1);
  const home = { url: value.website, quote: "Contact us" };
  assert.equal(check({ kind: "page", value: value.website, source: home }, home).length, 0);
  const privacy = { url: `${value.website}/privacy-policy`, quote: "Contact us for privacy requests" };
  assert.equal(check({ kind: "page", value: privacy.url, source: privacy }, privacy).length, 0);
  const email = { url: value.contact.source.url, quote: "Business inquiries: hello@new.example.com" };
  assert.equal(check({ kind: "email", value: "hello@new.example.com", source: email }, email).length, 1);
  assert.equal(check({ kind: "email", value: "invented@new.example.com", source: email }, email).length, 0);
  const directoryEmail = { ...email, quote: "Business inquiries: hello@other-company.com" };
  assert.equal(check({ kind: "email", value: "hello@other-company.com", source: directoryEmail }, directoryEmail).length, 0, "Published directory contact data cannot establish the directory as this company's official site");
  const foreign = { ...email, url: "https://directory.example.com/contact" };
  assert.equal(check({ kind: "email", value: "hello@new.example.com", source: foreign }, foreign).length, 0);
  for (const mailbox of ["no-reply", "privacy", "jobs", "legal"]) {
    const source = { ...email, quote: `${mailbox}@new.example.com` };
    assert.equal(check({ kind: "email", value: source.quote, source }, source).length, 0);
  }
  const legacy = { ...value, contact: undefined };
  assert(prospectCacheSchema.safeParse({ reports: { existing: "retained" }, prospects: { "6:en": { source: "old", result: { companies: [legacy], requested: 6, generatedAt: new Date().toISOString() } } } }).success, "Legacy caches still parse without overwriting interview reports");
});

test("Candidate verification uses distinct exact searched domains in bounded batches and never fetches injected paths", () => {
  const candidates = Array.from({ length: 16 }, (_, i) => ({ name: `Buyer ${i}`, urls: [`https://buyer${i}.example.com/contact`] }));
  const pages = candidates.map(c => ({ url: c.urls[0]!, title: c.name }));
  const batches = prospectResearchBatches({ candidates }, [...pages, { url: pages[0]!.url, title: "Buyer 0 Contact us" }], ["Buyer 0"], 10);
  assert.equal(batches.length, 12); assert(batches.every(b => b.length === 1));
  assert.equal(new Set(batches.flat().flatMap(c => c.urls)).size, 12);
  assert(!batches.flat().some(c => c.name === "Buyer 0"));
  assert.equal(prospectResearchBatches({ candidates }, pages, [], 6).flat().length, 9);
  const reused = prospectResearchBatches({ candidates: [{ name: "Invented path", urls: ["https://buyer0.example.com/guessed"] }] }, pages, [], 6);
  assert.equal(reused[0]![0]!.urls[0], "https://buyer0.example.com/contact", "Reuse the real searched page on that domain, never an invented path");
  assert(!reused.flat().flatMap(c => c.urls).some(u => u.includes("guessed")));
  assert(!prospectResearchBatches({ candidates: [{ name: "Invented domain", urls: ["https://never-searched.example.com/contact"] }] }, pages, [], 6).flat().flatMap(c => c.urls).some(u => u.includes("never-searched")));
  const pending = prospectResearchBatches({ candidates: [{ name: "Needs official domain discovery", urls: ["https://never-searched.example.com/contact"] }] }, pages, [], 6);
  assert.equal(pending[0]![0]!.name, "Needs official domain discovery");
  assert.deepEqual(pending[0]![0]!.urls, [], "Search the candidate by name without fetching an unverified model URL");
  assert.equal(prospectResearchBatches({ candidates: [{ name: "Different brand", urls: ["https://never-searched.example.com/contact"] }] }, pages, ["https://never-searched.example.com"], 6).length, 0, "An unsearched URL cannot disguise an already known company domain");
  assert.equal(prospectResearchBatches(null, [...pages, pages[0]!], [], 10).flat().length, 0, "Directory/page titles never become company candidates");
  assert.equal(prospectResearchBatches({ candidates: [{ name: "Canonical root", urls: ["https://root.example.com"] }] }, [{ url: "https://root.example.com/", title: "Root" }], [], 6)[0]![0]!.urls[0], "https://root.example.com/", "Use the actual searched URL when URL serialization only adds a root slash");
});


test("Evidence resolution repairs model contact and Taiwan selections only from the same official domain", () => {
  const buyer = company("Buyer");
  const business = { url: buyer.website + "/about", quote: "B2B software in Taipei, Taiwan" };
  const inbox = { url: buyer.website + "/", quote: "Business inquiries: hello@new.example.com" };
  const foreign = { url: "https://other.example.com/contact", quote: "Other company, Taipei Taiwan. Contact sales@other.example.com" };
  const broken = { ...buyer, taiwan: { ...buyer.taiwan, quote: "B2B software" }, contact: { kind: "page" as const, value: buyer.website, source: inbox } };
  const result = resolveProspectEvidence(broken, [business, inbox, foreign]);
  assert.equal(result.taiwan.quote, business.quote);
  assert.equal(result.contact?.kind, "email"); assert.equal(result.contact?.value, "hello@new.example.com");
  assert.equal(groundedProspects({ companies: [result] }, [business, inbox, foreign], [], 6).length, 1);
  const onlyForeign = resolveProspectEvidence(broken, [business, foreign]);
  assert.equal(groundedProspects({ companies: [onlyForeign] }, [business, foreign], [], 6).length, 0, "Never borrow another company's contact route");
  const guessed = resolveProspectEvidence({ ...broken, contact: { kind: "email", value: "guess@new.example.com", source: inbox } }, [business]);
  assert.equal(groundedProspects({ companies: [guessed] }, [business], [], 6).length, 0);
});
