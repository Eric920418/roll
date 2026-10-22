import test from "node:test";
import assert from "node:assert/strict";
import { excludeKnownCompanies, groundedProspects, prospectCompanySchema, prospectKey, publicWebsite } from "../src/lib/validation/prospect-schema";

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
  const noTaiwan = { ...valid, taiwan: { ...valid.taiwan, quote: "B2B software" } };
  assert.deepEqual(groundedProspects({ companies: [noTaiwan] }, sources, [], 6), []);
  assert.throws(() => groundedProspects({ companies: [{ ...valid, invented: "field" }] }, sources, [], 6));
  assert.equal(prospectCompanySchema.safeParse({ ...valid, website: "javascript:alert(1)" }).success, false);
  for (const url of ["http://example.com", "https://localhost/", "https://127.0.0.1/", "https://[::1]/", "https://user:pass@example.com/", "https://x.internal/", "https://example.com:8443/"]) assert.equal(publicWebsite(url), false, url);
  assert(publicWebsite("https://www.example.com/about"));
});
