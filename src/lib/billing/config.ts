export type PaypalEnvironment = "sandbox" | "live";

export const PRODUCTION_APP_ORIGIN = "https://www.rollgrp.com";

/**
 * PayPal sandbox 與 live 的憑證、方案、webhook 彼此不相容，因此環境值不能猜測。
 * Vercel Production 一律只允許 live；Preview 與本機仍可明確指定 sandbox。
 */
export function getPaypalEnvironment(
  rawValue = process.env.PAYPAL_ENV,
  vercelEnvironment = process.env.VERCEL_ENV,
): PaypalEnvironment {
  if (rawValue !== "sandbox" && rawValue !== "live") {
    throw new Error(
      "PAYPAL_ENV 必須精確設定為 sandbox 或 live，不可包含引號、空白或註解。",
    );
  }

  if (vercelEnvironment === "production" && rawValue !== "live") {
    throw new Error("Vercel Production 的 PAYPAL_ENV 必須設定為 live。");
  }

  return rawValue;
}

/** 建立 PayPal 訂閱前，鎖定 return/cancel URL 的可信 origin。 */
export function resolveBillingAppOrigin(
  requestUrl: string,
  configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL,
  vercelEnvironment = process.env.VERCEL_ENV,
): string {
  const fallbackOrigin = new URL(requestUrl).origin;
  const candidate = configuredAppUrl?.trim() || fallbackOrigin;

  let origin: string;
  try {
    origin = new URL(candidate).origin;
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL 必須是有效的絕對 URL。");
  }

  if (
    vercelEnvironment === "production" &&
    origin !== PRODUCTION_APP_ORIGIN
  ) {
    throw new Error(
      `Vercel Production 的 NEXT_PUBLIC_APP_URL 必須是 ${PRODUCTION_APP_ORIGIN}。`,
    );
  }

  return origin;
}
