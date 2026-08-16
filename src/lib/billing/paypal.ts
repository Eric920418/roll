import "server-only";
import { getPaypalEnvironment } from "@/lib/billing/config";

// PayPal 訂閱整合 — 直接打 REST API（不依賴 SDK，行為可預測、零新依賴）。
// 上游回應保留在伺服器例外供 log 診斷，API 的既有錯誤邊界負責遮蔽 5xx 細節。

function paypalBase(): string {
  return getPaypalEnvironment() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function getCreds(): { clientId: string; secret: string } | null {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) return null;
  return { clientId, secret };
}

/** PayPal 是否已備妥憑證（缺則前端應顯示「金流尚未設定」而非 crash） */
export function isPaypalConfigured(): boolean {
  getPaypalEnvironment();
  return getCreds() !== null;
}

/**
 * PayPal「自動付款／訂閱管理」頁 URL —— 扣款失敗（SUSPENDED）時引導客戶去更新付款方式。
 * 隨 PAYPAL_ENV 切 sandbox / live 網域（sandbox 帳號在 live 網域找不到訂閱）。
 */
export function paypalManagePaymentUrl(): string {
  const host =
    getPaypalEnvironment() === "live"
      ? "https://www.paypal.com"
      : "https://www.sandbox.paypal.com";
  return `${host}/myaccount/autopay/`;
}

async function getAccessToken(): Promise<string> {
  const creds = getCreds();
  if (!creds) {
    throw new Error(
      "PayPal 未設定：缺少 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET 環境變數",
    );
  }
  const auth = Buffer.from(`${creds.clientId}:${creds.secret}`).toString(
    "base64",
  );
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `PayPal 取得 access token 失敗（${res.status}）：${await res.text()}`,
    );
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function paypalFetch(
  path: string,
  init: RequestInit & { jsonBody?: unknown } = {},
): Promise<Response> {
  const token = await getAccessToken();
  const { jsonBody, headers, ...rest } = init;
  return fetch(`${paypalBase()}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : rest.body,
  });
}

export interface PaypalSubscription {
  id: string;
  status: string; // APPROVAL_PENDING / ACTIVE / SUSPENDED / CANCELLED / EXPIRED
  plan_id: string;
  billing_info?: {
    next_billing_time?: string;
  };
  start_time?: string;
  links?: { href: string; rel: string; method: string }[];
}

/** 建立訂閱，回傳 PayPal 訂閱 id + 供使用者核准的 approve URL */
export async function createSubscription(params: {
  planId: string;
  email: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; status: string; approveUrl: string }> {
  const res = await paypalFetch("/v1/billing/subscriptions", {
    method: "POST",
    jsonBody: {
      plan_id: params.planId,
      subscriber: { email_address: params.email },
      application_context: {
        brand_name: "ROLL ON.",
        locale: "en-US",
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    },
  });
  if (!res.ok) {
    throw new Error(`PayPal 建立訂閱失敗（${res.status}）：${await res.text()}`);
  }
  const sub = (await res.json()) as PaypalSubscription;
  const approveUrl = sub.links?.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) {
    throw new Error("PayPal 回應缺少 approve 連結，無法導向核准頁");
  }
  return { id: sub.id, status: sub.status, approveUrl };
}

/** 取得訂閱最新狀態（對帳用） */
export async function getSubscription(
  id: string,
): Promise<PaypalSubscription> {
  const res = await paypalFetch(
    `/v1/billing/subscriptions/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw new Error(`PayPal 查詢訂閱失敗（${res.status}）：${await res.text()}`);
  }
  return (await res.json()) as PaypalSubscription;
}

/** 取消訂閱（PayPal 回 204；之後 webhook 會送 CANCELLED 收尾） */
export async function cancelSubscription(
  id: string,
  reason = "User requested cancellation",
): Promise<void> {
  const res = await paypalFetch(
    `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
    { method: "POST", jsonBody: { reason } },
  );
  // 204 = 成功；422 含 SUBSCRIPTION_STATUS_INVALID 代表已非 active，視為已取消
  if (res.status === 204) return;
  const text = await res.text();
  if (res.status === 422 && text.includes("SUBSCRIPTION_STATUS_INVALID")) {
    return;
  }
  throw new Error(`PayPal 取消訂閱失敗（${res.status}）：${text}`);
}

/**
 * 驗證 webhook 簽章。需傳入 PayPal 的 transmission headers、設定的 webhook id、
 * 以及「已解析的事件物件」。回傳是否驗證通過。
 */
export async function verifyWebhookSignature(params: {
  transmissionId: string | null;
  transmissionTime: string | null;
  transmissionSig: string | null;
  certUrl: string | null;
  authAlgo: string | null;
  event: unknown;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PayPal webhook 未設定：缺少 PAYPAL_WEBHOOK_ID 環境變數");
  }
  if (
    !params.transmissionId ||
    !params.transmissionTime ||
    !params.transmissionSig ||
    !params.certUrl ||
    !params.authAlgo
  ) {
    return false; // 缺任一簽章 header 一律視為驗證失敗
  }
  const res = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    jsonBody: {
      auth_algo: params.authAlgo,
      cert_url: params.certUrl,
      transmission_id: params.transmissionId,
      transmission_sig: params.transmissionSig,
      transmission_time: params.transmissionTime,
      webhook_id: webhookId,
      webhook_event: params.event,
    },
  });
  if (!res.ok) {
    throw new Error(
      `PayPal 驗證 webhook 簽章失敗（${res.status}）：${await res.text()}`,
    );
  }
  const json = (await res.json()) as { verification_status: string };
  return json.verification_status === "SUCCESS";
}
