// 一次性 PayPal 設定腳本：建立 1 個 Product + Pro / Business 兩個月費 Billing Plan。
// 執行：
//   node --env-file=.env.local scripts/paypal-setup.mjs
// 完成後，把印出的 PAYPAL_PLAN_ID_PRO / PAYPAL_PLAN_ID_BUSINESS 填進 .env.local。
//
// 用 PayPal-Request-Id 做冪等：重跑會回傳同一筆資源（PayPal 保留期內），不會狂建重複。
// 注意：TWD 為零小數幣別，金額不帶小數（590 / 890）。

const BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const clientId = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !secret) {
  console.error(
    "✗ 缺少 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET。請先在 .env.local 設定，並以 --env-file=.env.local 執行。",
  );
  process.exit(1);
}

async function getToken() {
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`取得 token 失敗（${res.status}）：${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function api(token, path, body, requestId) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} 失敗（${res.status}）：${text}`);
  }
  return JSON.parse(text);
}

function monthlyPlan(productId, name, value) {
  return {
    product_id: productId,
    name,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0, // 0 = 無限續訂
        pricing_scheme: {
          fixed_price: { value, currency_code: "TWD" },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  };
}

async function main() {
  console.log(`→ 環境：${process.env.PAYPAL_ENV === "live" ? "LIVE" : "SANDBOX"} (${BASE})`);
  const token = await getToken();

  const product = await api(
    token,
    "/v1/catalogs/products",
    { name: "ROLL ON. Membership", type: "SERVICE", category: "SOFTWARE" },
    "rollon-product-v1",
  );
  console.log(`✓ Product: ${product.id}`);

  const pro = await api(
    token,
    "/v1/billing/plans",
    monthlyPlan(product.id, "ROLL ON. Pro", "590"),
    "rollon-plan-pro-v1",
  );
  const business = await api(
    token,
    "/v1/billing/plans",
    monthlyPlan(product.id, "ROLL ON. Business", "890"),
    "rollon-plan-business-v1",
  );

  console.log("\n把以下兩行填進 .env.local：\n");
  console.log(`PAYPAL_PLAN_ID_PRO=${pro.id}`);
  console.log(`PAYPAL_PLAN_ID_BUSINESS=${business.id}`);
}

main().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
