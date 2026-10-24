import { syncUserReferral, recordReferralRefund } from "@/lib/referrals/service";
import { logSecurityError } from "@/lib/security/log";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrder, verifyWebhookSignature } from "@/lib/billing/paypal";
import { reconcileById } from "@/lib/billing/reconcile";
import { fulfillCreditOrder } from "@/lib/billing/credits";

// PayPal webhook。proxy 對 /api/* 放行；此端點不查 session，改以簽章驗證授權。
// 設計：驗章 → 記錄事件（審計）→ 對帳（idempotent）→ 200；對帳失敗回 500 讓 PayPal 重送。

// 需要觸發對帳的事件類型。
// 訂閱類事件用 prefix 比對而非逐一列舉 —— 白名單漏一個事件（例如客戶更新付款方式後的
// BILLING.SUBSCRIPTION.RE-ACTIVATED，注意官方名稱帶連字號）就等於漏對帳，客戶付了錢
// 權限卻回不來。reconcile 以 PayPal 為權威來源且冪等，多對帳幾次無害、漏對帳才有害。
const RELEVANT_PREFIX = "BILLING.SUBSCRIPTION.";
const RELEVANT_EXACT = new Set(["PAYMENT.SALE.COMPLETED"]);
const CREDIT_CAPTURE_EVENT = "PAYMENT.CAPTURE.COMPLETED";

function needsReconcile(eventType: string): boolean {
  return eventType.startsWith(RELEVANT_PREFIX) || RELEVANT_EXACT.has(eventType);
}

type PaypalEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    state?: string;
    sale_id?: string;
    billing_agreement_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
    links?: Array<{ rel: string; href: string }>;
  };
};

/** 從事件取出訂閱 id（訂閱事件在 resource.id；扣款事件在 resource.billing_agreement_id） */
function extractSubscriptionId(event: PaypalEvent): string | null {
  const r = event.resource;
  if (!r) return null;
  if (typeof r.billing_agreement_id === "string") return r.billing_agreement_id;
  if (typeof r.id === "string") return r.id;
  return null;
}

export const maxDuration = 300;
export async function POST(req: NextRequest) {
  // 1. 取 raw body（簽章驗證需原始字串）
  const raw = await req.text();

  let event: PaypalEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  try {
    // 2. 驗證簽章
    const verified = await verifyWebhookSignature({
      transmissionId: req.headers.get("paypal-transmission-id"),
      transmissionTime: req.headers.get("paypal-transmission-time"),
      transmissionSig: req.headers.get("paypal-transmission-sig"),
      certUrl: req.headers.get("paypal-cert-url"),
      authAlgo: req.headers.get("paypal-auth-algo"),
      event,
    });
    if (!verified) {
      return NextResponse.json(
        { error: "webhook signature verification failed" },
        { status: 401 },
      );
    }

    const eventId = event.id;
    const eventType = event.event_type ?? "UNKNOWN";
    if (!eventId) {
      return NextResponse.json({ error: "missing event id" }, { status: 400 });
    }

    const subId = extractSubscriptionId(event);

    // 3. 記錄事件（審計 + 去重）。已存在則 update payload，不視為錯誤。
    await prisma.webhookEvent.upsert({
      where: { id: eventId },
      create: {
        id: eventId,
        eventType,
        resourceId: subId,
        payload: event as object,
      },
      update: { payload: event as object },
    });

    // 4. 對帳（idempotent；以 PayPal 為權威來源）
    if (subId && needsReconcile(eventType)) {
      await reconcileById(subId);
      const owner = await prisma.subscription.findUnique({ where: { paypalSubscriptionId: subId }, select: { userId: true } });
      if (owner) await syncUserReferral(owner.userId);
    }

    // Orders webhook 與 return URL 可能同時抵達；fulfillCreditOrder 以 order/capture
    // unique constraint 保證只加值一次。
    if (eventType === CREDIT_CAPTURE_EVENT) {
      const orderId =
        event.resource?.supplementary_data?.related_ids?.order_id ?? null;
      if (orderId) {
        const purchase = await prisma.aiCreditPurchase.findUnique({
          where: { paypalOrderId: orderId },
          select: { id: true },
        });
        if (purchase) { const result = await fulfillCreditOrder(await getOrder(orderId)); await syncUserReferral(result.userId); }
        else { const founder = await prisma.founderOrder.findUnique({ where: { paypalOrderId: orderId }, select: { userId: true } }); if (founder) { await (await import("@/lib/discovery/founder")).fulfillFounderOrder(await getOrder(orderId)); if (founder.userId) await syncUserReferral(founder.userId); } }
      }
    }

    if (eventType === "PAYMENT.CAPTURE.REFUNDED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
      const path = event.resource?.links?.find(link => link.rel === "up")?.href;
      const captureId = eventType === "PAYMENT.CAPTURE.REVERSED" ? event.resource?.id : path?.match(/\/v2\/payments\/captures\/([A-Za-z0-9]+)(?:[/?#]|$)/)?.[1];
      if (captureId) {
        if (eventType === "PAYMENT.CAPTURE.REVERSED" || event.resource?.status === "COMPLETED") await recordReferralRefund(`capture:${captureId}`);
        await (await import("@/lib/discovery/founder")).revokeFounderCapture(captureId, eventType === "PAYMENT.CAPTURE.REVERSED");
      }
    }

    if (eventType === "PAYMENT.SALE.REFUNDED" || eventType === "PAYMENT.SALE.REVERSED") {
      const source = event.resource as (typeof event.resource & { sale_id?: string });
      const saleId = source?.sale_id ?? (eventType === "PAYMENT.SALE.REVERSED" ? source?.id : null);
      if (!saleId) throw new Error("Refund event missing sale reference");
      if (eventType === "PAYMENT.SALE.REVERSED" || event.resource?.state?.toLowerCase() === "completed") await recordReferralRefund(`sale:${saleId}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // 對帳失敗：記 log 並回 500，讓 PayPal 重送（reconcile 為 idempotent，重送安全）
    logSecurityError("[paypal webhook] processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed; PayPal should retry.", code: "webhook_processing_failed" },
      { status: 500 },
    );
  }
}
