import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { captureCreditOrder, getOrder } from "@/lib/billing/paypal";
import { fulfillCreditOrder } from "@/lib/billing/credits";
import { getUserSession } from "@/lib/auth/guard";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    if (!orderId) return fail("缺少 PayPal order id。", 400);

    const local = await prisma.aiCreditPurchase.findUnique({
      where: { paypalOrderId: orderId },
    });
    if (!local || local.userId !== session.uid) return fail("找不到這筆額度訂單。", 404);
    if (local.status === "COMPLETED") {
      return ok({ status: "COMPLETED", added: false });
    }

    let order;
    try {
      order = await captureCreditOrder(orderId, `capture-${local.requestId}`.slice(0, 72));
    } catch (error) {
      // 使用者重整 return page 時訂單可能已 capture；查詢權威狀態後再做冪等入帳。
      order = await getOrder(orderId);
      if (order.status !== "COMPLETED") throw error;
    }
    const result = await fulfillCreditOrder(order);
    return ok({ status: order.status, added: result.added });
  } catch (error) {
    return failFromError(error);
  }
}
