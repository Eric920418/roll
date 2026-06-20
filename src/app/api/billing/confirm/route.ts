import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { reconcileById } from "@/lib/billing/reconcile";

// 使用者於 PayPal 核准後返回 /dashboard/billing/return，由該頁呼叫此端點即時對帳。
// （webhook 之後會再次以權威事件確認；confirm 只是讓使用者馬上看到結果。）
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const subscriptionId =
      typeof body?.subscriptionId === "string" ? body.subscriptionId : "";
    if (!subscriptionId) return fail("缺少 subscriptionId", 400);

    // 僅允許對帳「屬於本人」的訂閱
    const local = await prisma.subscription.findUnique({
      where: { paypalSubscriptionId: subscriptionId },
    });
    if (!local || local.userId !== session.uid) {
      return fail("找不到對應的訂閱", 404);
    }

    const status = await reconcileById(subscriptionId);
    return ok({ status });
  } catch (error) {
    return failFromError(error);
  }
}
