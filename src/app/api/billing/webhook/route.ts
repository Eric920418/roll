import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/billing/paypal";
import { reconcileById } from "@/lib/billing/reconcile";

// PayPal webhook。proxy 對 /api/* 放行；此端點不查 session，改以簽章驗證授權。
// 設計：驗章 → 記錄事件（審計）→ 對帳（idempotent）→ 200；對帳失敗回 500 讓 PayPal 重送。

// 需要觸發對帳的事件類型。
// 訂閱類事件用 prefix 比對而非逐一列舉 —— 白名單漏一個事件（例如客戶更新付款方式後的
// BILLING.SUBSCRIPTION.RE-ACTIVATED，注意官方名稱帶連字號）就等於漏對帳，客戶付了錢
// 權限卻回不來。reconcile 以 PayPal 為權威來源且冪等，多對帳幾次無害、漏對帳才有害。
const RELEVANT_PREFIX = "BILLING.SUBSCRIPTION.";
const RELEVANT_EXACT = new Set(["PAYMENT.SALE.COMPLETED"]);

function needsReconcile(eventType: string): boolean {
  return eventType.startsWith(RELEVANT_PREFIX) || RELEVANT_EXACT.has(eventType);
}

type PaypalEvent = {
  id?: string;
  event_type?: string;
  resource?: { id?: string; billing_agreement_id?: string };
};

/** 從事件取出訂閱 id（訂閱事件在 resource.id；扣款事件在 resource.billing_agreement_id） */
function extractSubscriptionId(event: PaypalEvent): string | null {
  const r = event.resource;
  if (!r) return null;
  if (typeof r.billing_agreement_id === "string") return r.billing_agreement_id;
  if (typeof r.id === "string") return r.id;
  return null;
}

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
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // 對帳失敗：記 log 並回 500，讓 PayPal 重送（reconcile 為 idempotent，重送安全）
    console.error("[paypal webhook] processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
