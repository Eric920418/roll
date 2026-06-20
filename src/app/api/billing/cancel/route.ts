import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth/account";
import { ok, unauthorized, failFromError } from "@/lib/api";
import { cancelSubscription } from "@/lib/billing/paypal";
import { reconcileById } from "@/lib/billing/reconcile";

function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

// 取消本人目前生效的訂閱。PayPal 取消後立即對帳（樂觀更新為 CANCELLED），
// 之後 webhook 的 CANCELLED 事件會再確認一次。
export async function POST() {
  try {
    const account = await getCurrentAccount();
    if (!account) return unauthorized();

    const subId = account.paypalSubscriptionId;
    if (!subId) {
      return bad("noSubscription", "沒有可取消的生效訂閱。", 400);
    }

    await cancelSubscription(subId);
    const status = await reconcileById(subId);
    return ok({ status });
  } catch (error) {
    return failFromError(error);
  }
}
