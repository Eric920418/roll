import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import ts from "typescript";
import { excludeKnownCompanies, groundedProspects, prospectCompanySchema, prospectKey, publicWebsite, taiwanEvidence } from "../src/lib/validation/prospect-schema";

const company = (name: string, domain = "new.example.com") => ({ name, aliases: [] as string[], website: `https://${domain}`, reason: "Potential ICP fit; confirm with outreach", taiwan: { url: `https://${domain}/about`, quote: "Taipei, Taiwan" }, fit: { url: `https://${domain}/about`, quote: "B2B software" } });
test("Prospect exclusions normalize Unicode, legal suffixes, punctuation and aliases without substring overblocking", () => {
  assert.equal(prospectKey(" ＣｉｒｃｌｅＷｅ Co., Ltd. "), prospectKey("CircleWe"));
  assert.equal(prospectKey("EV Rapid Force Inc."), prospectKey("EV Rapid Force"));
  assert.equal(prospectKey("台灣示範股份有限公司"), prospectKey("台灣示範"));
  const known = ["CircleWe", "EV Rapid Force", "Other Name", "https://www.own.example.com"];
  const companies = [company("Circle We"), company("EV-Rapid-Force", "ev.example.com"), { ...company("新品牌", "alias.example.com"), aliases: ["Other Name Ltd."] }, company("Different Name", "own.example.com"), company("New Company", "new.example.com"), company("New Company 2", "new.example.com"), company("Circle Ventures", "circle.example.com")];
  assert.deepEqual(excludeKnownCompanies(companies, known).map(v => v.name), ["New Company", "Circle Ventures"]);
});
test("Only officially cited Taiwan prospects qualify, fewer than requested is valid; invalid or ungrounded data never fills quotas", () => {
  const valid = company("Real"), other = company("Other", "other.example.com");
  const sources = [{ url: valid.taiwan.url, quote: "Based in Taipei, Taiwan. B2B software" }];
  assert.deepEqual(groundedProspects({ companies: [valid, other] }, sources, [], 6), [valid]);
  assert.deepEqual(groundedProspects({ companies: [valid] }, sources, ["Real"], 10), []);
  assert.deepEqual(groundedProspects({ companies: [{ ...valid, taiwan: { ...valid.taiwan, quote: "Taiwan invented" } }] }, sources, [], 6), []);
  assert.deepEqual(groundedProspects({ companies: [{ ...valid, website: "https://fake.example.com" }] }, sources, [], 6), []);
  assert.equal(groundedProspects({ companies: [{ ...valid, website: "https://example.com" }] }, sources, [], 6).length, 1, "Official subdomains can support a corporate website");
  const gov = { url: "https://startup.sme.gov.tw/company/real", quote: "Real is a B2B software company operating in Taipei, Taiwan" };
  const govCompany = { ...valid, taiwan: gov, fit: gov };
  const govSources = [gov, { url: valid.website, quote: "Real official software website" }];
  assert.equal(groundedProspects({ companies: [govCompany] }, govSources, [], 6).length, 1);
  assert.equal(groundedProspects({ companies: [{ ...govCompany, name: "Not Real Company" }] }, govSources, [], 6).length, 0);
  assert.equal(groundedProspects({ companies: [{ ...govCompany, website: "https://invented.example.com" }] }, govSources, [], 6).length, 0);
  const noTaiwan = { ...valid, taiwan: { ...valid.taiwan, quote: "B2B software" } };
  assert.deepEqual(groundedProspects({ companies: [noTaiwan] }, sources, [], 6), []);
  assert.throws(() => groundedProspects({ companies: [{ ...valid, invented: "field" }] }, sources, [], 6));
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
    assert(newList.includes(zh ? "平台外是否接觸過" : "outside NOVA"));
    const existingList = html.slice(followup, html.indexOf(zh ? "訪談證據分析" : "Interview evidence analysis"));
    assert(existingList.includes("CircleWe") && existingList.includes("Saved Lead") && !existingList.includes("New Taiwan Buyer"));
    assert.equal(existingList.split(zh ? "已有訪談紀錄" : "Interview recorded").length - 1, 1);
    assert.equal(existingList.split(zh ? "已加入跟進" : "Saved for follow-up").length - 1, 1);
    assert(existingList.includes(zh ? "查看紀錄／繼續跟進" : "View records / continue follow-up"));
  }
});
