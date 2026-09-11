import assert from "node:assert/strict";
import test from "node:test";
import {
  getPaypalEnvironment,
  resolveBillingAppOrigin,
} from "../src/lib/billing/config";
import { publicCopilotFailureMessage } from "../src/lib/ai/public-error";
import {
  billingVariantFor,
  monthlyEquivalentLabel,
  monthlyPriceLabel,
} from "../src/lib/billing/plans";
import { monthlyCycle } from "../src/lib/ai/allowance-cycle";
import en from "../messages/en.json";
import zh from "../messages/zh-tw.json";
import { validateInvestorPdf } from "../src/lib/investor/pdf";
import { safeInvestorInvitePath } from "../src/lib/auth/return-path";

test("PayPal 環境值必須精確，不接受從 env 範例複製出的引號或註解", () => {
  assert.throws(
    () => getPaypalEnvironment('"sandbox" # sandbox | live', "production"),
    /PAYPAL_ENV/,
  );
});

test("Vercel Production 禁止靜默使用 PayPal sandbox", () => {
  assert.throws(
    () => getPaypalEnvironment("sandbox", "production"),
    /Production.*live/,
  );
  assert.equal(getPaypalEnvironment("live", "production"), "live");
  assert.equal(getPaypalEnvironment("sandbox", "preview"), "sandbox");
});

test("Production PayPal return/cancel URL 只接受 canonical www origin", () => {
  assert.equal(
    resolveBillingAppOrigin(
      "https://www.rollgrp.com/api/billing/subscribe",
      "https://www.rollgrp.com/",
      "production",
    ),
    "https://www.rollgrp.com",
  );
  assert.throws(
    () =>
      resolveBillingAppOrigin(
        "https://www.rollgrp.com/api/billing/subscribe",
        "http://localhost:3000",
        "production",
      ),
    /https:\/\/www\.rollgrp\.com/,
  );
  assert.throws(
    () =>
      resolveBillingAppOrigin(
        "https://rollgrp.com/api/billing/subscribe",
        "",
        "production",
      ),
    /https:\/\/www\.rollgrp\.com/,
  );
});

test("NOVA 串流錯誤永遠不包含上游 403 或 JSON", () => {
  const upstream = new Error('403 {"error":{"type":"permission_error"}}');
  const zh = publicCopilotFailureMessage("zh-tw", upstream);
  const en = publicCopilotFailureMessage("en", upstream);

  assert.equal(zh, "顧問暫時無法連線，請稍後再試。");
  assert.equal(en, "The advisor is temporarily unavailable. Please try again later.");
  for (const message of [zh, en]) {
    assert.doesNotMatch(message, /403|permission_error|\{"error"/);
  }
});

test("帳務頁與 PayPal 四個 USD 方案共用單一事實來源", () => {
  assert.equal(monthlyPriceLabel("pro"), "USD 49");
  assert.equal(monthlyPriceLabel("business"), "USD 149");
  assert.equal(monthlyEquivalentLabel("pro"), "USD 39");
  assert.equal(monthlyEquivalentLabel("business"), "USD 139");
  assert.equal(billingVariantFor("pro", "year")?.amountMinor, 46_800);
  assert.equal(billingVariantFor("business", "year")?.amountMinor, 166_800);
});

test("NOVA 月額度依訂閱週年日重置，月底日期會正確夾限", () => {
  const cycle = monthlyCycle(
    new Date("2026-01-31T08:00:00.000Z"),
    new Date("2026-02-28T12:00:00.000Z"),
  );
  assert.equal(cycle.start.toISOString(), "2026-02-28T08:00:00.000Z");
  assert.equal(cycle.end.toISOString(), "2026-03-31T08:00:00.000Z");
});

test("英文與繁中翻譯鍵完全平行", () => {
  const keys = (value: unknown, prefix = ""): string[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [path, ...keys(child, path)];
    });
  };
  assert.deepEqual(keys(en), keys(zh));
});

test("Investor Portal 只接受 10 MB 內且具有 PDF 檔頭的 PDF", () => {
  assert.equal(validateInvestorPdf({ name: "plan.pdf", type: "application/pdf", size: 100, header: "%PDF-" }), null);
  assert.match(validateInvestorPdf({ name: "plan.pdf", type: "application/pdf", size: 100, header: "<html" })!, /不是有效/);
  assert.match(validateInvestorPdf({ name: "plan.exe", type: "application/pdf", size: 100, header: "%PDF-" })!, /副檔名/);
  assert.match(validateInvestorPdf({ name: "plan.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1, header: "%PDF-" })!, /10 MB/);
});

test("登入返回路徑只允許本語系 Investor 一次性邀請", () => {
  const token = "a".repeat(43);
  assert.equal(safeInvestorInvitePath(`/investor/invite/${token}`, "en"), `/investor/invite/${token}`);
  assert.equal(safeInvestorInvitePath(`/zh-tw/investor/invite/${token}`, "zh-tw"), `/zh-tw/investor/invite/${token}`);
  assert.equal(safeInvestorInvitePath("https://evil.example/investor/invite/" + token, "en"), null);
  assert.equal(safeInvestorInvitePath(`/investor/invite/${token}`, "zh-tw"), null);
});
