// 建立或重用同一個 PayPal Product 下的四個 USD 訂閱方案。
// 預設 dry-run；真的建立需明確加 --apply：
// node --env-file=.env.local scripts/paypal-setup.mjs --apply

const apply = process.argv.includes("--apply");
const paypalEnv = process.env.PAYPAL_ENV;
if (paypalEnv !== "sandbox" && paypalEnv !== "live") {
  throw new Error("PAYPAL_ENV 必須精確設定為 sandbox 或 live。");
}
if (process.env.VERCEL_ENV === "production" && paypalEnv !== "live") {
  throw new Error("Vercel Production 的 PAYPAL_ENV 必須設定為 live。");
}

const BASE =
  paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
const clientId = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

const definitions = [
  ["PAYPAL_PLAN_ID_PRO_MONTHLY_USD", "ROLL ON. Pro monthly", "MONTH", "49.00"],
  ["PAYPAL_PLAN_ID_PRO_YEARLY_USD", "ROLL ON. Pro yearly", "YEAR", "468.00"],
  ["PAYPAL_PLAN_ID_BUSINESS_MONTHLY_USD", "ROLL ON. Business monthly", "MONTH", "149.00"],
  ["PAYPAL_PLAN_ID_BUSINESS_YEARLY_USD", "ROLL ON. Business yearly", "YEAR", "1668.00"],
];

async function token() {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`取得 token 失敗（${res.status}）：${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(accessToken, method, path, body, requestId) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} 失敗（${res.status}）：${text}`);
  return text ? JSON.parse(text) : null;
}

function planBody(productId, name, interval, value) {
  return {
    product_id: productId,
    name,
    status: "ACTIVE",
    billing_cycles: [{
      frequency: { interval_unit: interval, interval_count: 1 },
      tenure_type: "REGULAR",
      sequence: 1,
      total_cycles: 0,
      pricing_scheme: { fixed_price: { value, currency_code: "USD" } },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  };
}

async function main() {
  console.log(`環境：${paypalEnv.toUpperCase()} · 模式：${apply ? "APPLY" : "DRY RUN"}`);
  if (!apply) {
    for (const [envKey, name, interval, value] of definitions) {
      console.log(`${process.env[envKey] ? "重用" : "建立"} ${name}: USD ${value}/${interval.toLowerCase()}`);
    }
    console.log("未呼叫 PayPal 寫入 API；加 --apply 才會建立缺少的項目。");
    return;
  }
  if (!clientId || !secret) {
    throw new Error("缺少 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET。");
  }

  const accessToken = await token();
  let productId = process.env.PAYPAL_PRODUCT_ID;
  if (!productId) {
    const products = await api(accessToken, "GET", "/v1/catalogs/products?page_size=20", null);
    productId = products.products?.find((item) => item.name === "NOVA")?.id;
  }
  if (!productId) {
    const product = await api(
      accessToken,
      "POST",
      "/v1/catalogs/products",
      { name: "NOVA", type: "SERVICE", category: "SOFTWARE" },
      `rollon-nova-product-${paypalEnv}`,
    );
    productId = product.id;
  }

  const existing = await api(
    accessToken,
    "GET",
    `/v1/billing/plans?product_id=${encodeURIComponent(productId)}&page_size=20&total_required=true`,
    null,
  );
  const output = { PAYPAL_PRODUCT_ID: productId };
  for (const [envKey, name, interval, value] of definitions) {
    const configured = process.env[envKey];
    const found = existing.plans?.find((item) => item.name === name)?.id;
    if (configured && found && configured !== found) {
      throw new Error(`${envKey} 與 PayPal 同名方案不一致，請先人工對帳。`);
    }
    const planId = configured || found || (await api(
      accessToken,
      "POST",
      "/v1/billing/plans",
      planBody(productId, name, interval, value),
      `rollon-${envKey.toLowerCase()}-${paypalEnv}`,
    )).id;
    output[envKey] = planId;
  }

  console.log("\n請將以下值設定到對應環境：\n");
  for (const [key, value] of Object.entries(output)) console.log(`${key}=${value}`);
}

main().catch((error) => {
  console.error("✗", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
