import "server-only";
import { prisma } from "@/lib/prisma";
import { planFromPaypalPlanId, type PlanKey } from "@/lib/billing/plans";
import {
  getSubscription,
  type PaypalSubscription,
} from "@/lib/billing/paypal";

// 把 PayPal 的訂閱狀態對帳進 DB：更新本地 Subscription 紀錄 + User 計費快取。
// confirm（使用者核准返回）與 webhook（權威事件）共用同一套邏輯，確保結果一致。

/** 依一份 PayPal 訂閱物件對帳 DB */
export async function reconcileFromPaypal(
  paypalSub: PaypalSubscription,
): Promise<void> {
  const local = await prisma.subscription.findUnique({
    where: { paypalSubscriptionId: paypalSub.id },
  });

  const plan: PlanKey | null =
    (local?.plan as PlanKey | undefined) ??
    planFromPaypalPlanId(paypalSub.plan_id);

  const status = paypalSub.status;
  const nextBilling = paypalSub.billing_info?.next_billing_time
    ? new Date(paypalSub.billing_info.next_billing_time)
    : null;
  const startedAt = paypalSub.start_time
    ? new Date(paypalSub.start_time)
    : null;
  const isTerminal = status === "CANCELLED" || status === "EXPIRED";

  if (local) {
    await prisma.subscription.update({
      where: { id: local.id },
      data: {
        status,
        currentPeriodEnd: nextBilling ?? local.currentPeriodEnd,
        startedAt: startedAt ?? local.startedAt,
        cancelledAt: isTerminal ? (local.cancelledAt ?? new Date()) : null,
      },
    });
  }

  // 只有在能對應到 userId 時才更新 User
  const userId = local?.userId;
  if (!userId || !plan) return;

  // EXPIRED（真正結束）才把 User.plan 歸零；其餘狀態保留方案、由 gate 的寬限期邏輯把關存取
  const storedPlan: PlanKey = status === "EXPIRED" ? "free" : plan;

  // planUpdatedAt 只在 plan/status「真的變化」時才更新 —— 它是 gate 的 SUSPENDED 寬限期
  // 起算點，若每次對帳都無條件刷新，PayPal 的重送／重複投遞會不斷延長寬限期，
  // 讓扣款失敗的帳號無限期保有付費存取。
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  });
  const planOrStatusChanged =
    currentUser?.plan !== storedPlan ||
    currentUser?.subscriptionStatus !== status;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: storedPlan,
      subscriptionStatus: status,
      paypalSubscriptionId: paypalSub.id,
      // 與上方 Subscription 表一致：PayPal 對已取消/非活躍訂閱常不回 next_billing_time
      // （nextBilling=null），此時「保留」既有到期日，切勿用 null 覆寫 —— 否則 gate 的
      // CANCELLED 寬限期會被清空，導致取消後立即失去 Pro（本次修的阻斷 bug）。
      currentPeriodEnd: nextBilling ?? local?.currentPeriodEnd ?? null,
      ...(planOrStatusChanged ? { planUpdatedAt: new Date() } : {}),
    },
  });
}

/** 由訂閱 id 取最新狀態並對帳（webhook / confirm 用，永遠以 PayPal 為權威來源） */
export async function reconcileById(subscriptionId: string): Promise<string> {
  const sub = await getSubscription(subscriptionId);
  await reconcileFromPaypal(sub);
  return sub.status;
}
