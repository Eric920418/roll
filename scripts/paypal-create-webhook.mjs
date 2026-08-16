// 建立 PayPal webhook（指向 production 的 /api/billing/webhook）。
// 執行：
//   node --env-file=.env.local scripts/paypal-create-webhook.mjs [webhookUrl]
//   webhookUrl 預設 https://www.rollgrp.com/api/billing/webhook
//
// 冪等：若該 URL 已註冊，自動查回 id，保留額外事件並 PATCH 補齊必要事件。
// 印出 PAYPAL_WEBHOOK_ID=...，填進 Vercel env 與 .env.local。
// 註：webhook 屬於目前憑證的環境（sandbox 憑證 → sandbox webhook）。切 live 時用 live 憑證重跑。

const paypalEnv = process.env.PAYPAL_ENV;
if (paypalEnv !== "sandbox" && paypalEnv !== "live") {
  console.error(
    "✗ PAYPAL_ENV 必須精確設定為 sandbox 或 live，不可包含引號、空白或註解。",
  );
  process.exit(1);
}
if (process.env.VERCEL_ENV === "production" && paypalEnv !== "live") {
  console.error("✗ Vercel Production 的 PAYPAL_ENV 必須設定為 live。");
  process.exit(1);
}

const BASE =
  paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const clientId = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
const WEBHOOK_URL =
  process.argv[2] || "https://www.rollgrp.com/api/billing/webhook";

const EVENT_TYPES = [
  "BILLING.SUBSCRIPTION.CREATED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
];

if (!clientId || !secret) {
  console.error(
    "✗ 缺少 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET。請以 --env-file=.env.local 執行。",
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

async function findExistingWebhook(token) {
  const res = await fetch(`${BASE}/v1/notifications/webhooks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`查詢既有 webhooks 失敗（${res.status}）：${await res.text()}`);
  }
  const json = await res.json();
  return (json.webhooks || []).find((w) => w.url === WEBHOOK_URL) || null;
}

async function ensureWebhookEventTypes(token, webhook) {
  const existingNames = (webhook.event_types || [])
    .map((eventType) => eventType.name)
    .filter(Boolean);
  const mergedNames = [...new Set([...existingNames, ...EVENT_TYPES])];
  const missingNames = EVENT_TYPES.filter(
    (name) => !existingNames.includes(name),
  );
  if (missingNames.length === 0) {
    console.log("✓ 既有 webhook 事件訂閱已完整");
    return;
  }

  const res = await fetch(
    `${BASE}/v1/notifications/webhooks/${encodeURIComponent(webhook.id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          op: "replace",
          path: "/event_types",
          value: mergedNames.map((name) => ({ name })),
        },
      ]),
    },
  );
  if (!res.ok) {
    throw new Error(
      `補齊既有 webhook 事件失敗（${res.status}）：${await res.text()}`,
    );
  }
  console.log(`✓ 已補齊 webhook 事件：${missingNames.join(", ")}`);
}

async function main() {
  console.log(
    `→ 環境：${paypalEnv === "live" ? "LIVE" : "SANDBOX"} (${BASE})`,
  );
  console.log(`→ webhook URL：${WEBHOOK_URL}`);
  const token = await getToken();

  const res = await fetch(`${BASE}/v1/notifications/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      event_types: EVENT_TYPES.map((name) => ({ name })),
    }),
  });

  let webhookId;
  if (res.ok) {
    webhookId = (await res.json()).id;
    console.log(`✓ 已建立新 webhook`);
  } else {
    const text = await res.text();
    if (text.includes("WEBHOOK_URL_ALREADY_EXISTS")) {
      console.log("→ 該 URL 已註冊，查回並核對既有 webhook…");
      const existingWebhook = await findExistingWebhook(token);
      if (!existingWebhook) {
        throw new Error(`URL 已存在但查不到對應 webhook id：${text}`);
      }
      webhookId = existingWebhook.id;
      await ensureWebhookEventTypes(token, existingWebhook);
    } else {
      throw new Error(`建立 webhook 失敗（${res.status}）：${text}`);
    }
  }

  console.log("\n把以下這行填進 Vercel env 與 .env.local：\n");
  console.log(`PAYPAL_WEBHOOK_ID=${webhookId}`);
}

main().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
