import assert from "node:assert/strict";
import test from "node:test";
import {
  getPaypalEnvironment,
  resolveBillingAppOrigin,
} from "../src/lib/billing/config";
import { publicCopilotFailureMessage } from "../src/lib/ai/public-error";
import { monthlyPriceLabel } from "../src/lib/billing/plans";

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

test("帳務頁價格與 PayPal TWD 方案共用單一事實來源", () => {
  assert.equal(monthlyPriceLabel("pro"), "NT$590");
  assert.equal(monthlyPriceLabel("business"), "NT$890");
});
