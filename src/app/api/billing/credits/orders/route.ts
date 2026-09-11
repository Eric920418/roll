import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlan } from "@/lib/billing/gate";
import { createCreditOrder, getOrder, isPaypalConfigured } from "@/lib/billing/paypal";
import { resolveBillingAppOrigin } from "@/lib/billing/config";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const account = await requirePlan("pro");
    if (!account) return fail("只有有效 Pro 以上方案或試用帳號可以加購 NOVA 次數。", 403);
    if (!isPaypalConfigured()) return fail("PayPal 金流尚未設定。", 503);

    const rate = await checkRateLimit(`credit-order:${session.uid}`, 10, 15 * MINUTE_MS);
    if (!rate.ok) return fail("額度結帳嘗試過於頻繁，請稍後再試。", 429);

    const body = await req.json();
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const locale: Locale = body?.locale === "zh-tw" ? "zh-tw" : "en";
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return fail("無效的結帳 request id。", 400);

    const existing = await prisma.aiCreditPurchase.findUnique({ where: { requestId } });
    if (existing) {
      if (existing.userId !== session.uid) return fail("這個結帳 request id 已被其他帳號使用。", 409);
      const remote = await getOrder(existing.paypalOrderId);
      const approveUrl = remote.links?.find((link) => link.rel === "approve")?.href;
      if (!approveUrl) return fail("這筆額度訂單已處理，請重新整理 Billing 查看餘額。", 409);
      return ok({ orderId: existing.paypalOrderId, approveUrl });
    }

    const appUrl = resolveBillingAppOrigin(req.url);
    const returnUrl = `${appUrl}${pathForLocale("/dashboard/billing/credits/return", locale)}`;
    const cancelUrl = `${appUrl}${pathForLocale("/dashboard/billing", locale)}?creditCancelled=1`;
    const order = await createCreditOrder({
      userId: session.uid,
      requestId,
      returnUrl,
      cancelUrl,
    });
    await prisma.aiCreditPurchase.create({
      data: {
        userId: session.uid,
        requestId,
        paypalOrderId: order.id,
        status: order.status,
      },
    });
    return ok({ orderId: order.id, approveUrl: order.approveUrl });
  } catch (error) {
    return failFromError(error);
  }
}
