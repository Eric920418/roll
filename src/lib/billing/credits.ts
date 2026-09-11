import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PaypalOrder } from "./paypal";

function completedCapture(order: PaypalOrder) {
  return order.purchase_units?.[0]?.payments?.captures?.find(
    (capture) => capture.status === "COMPLETED",
  );
}

export async function fulfillCreditOrder(
  order: PaypalOrder,
): Promise<{ userId: string; added: boolean }> {
  if (order.status !== "COMPLETED") {
    throw new Error(`PayPal 額度訂單尚未完成（目前狀態：${order.status}）。`);
  }
  const capture = completedCapture(order);
  if (!capture) throw new Error("PayPal 額度訂單缺少已完成的 capture。");
  if (
    capture.amount?.currency_code !== "USD" ||
    capture.amount?.value !== "5.00"
  ) {
    throw new Error("PayPal 額度訂單金額或幣別不符，未增加任何次數。");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const purchase = await tx.aiCreditPurchase.findUnique({
            where: { paypalOrderId: order.id },
          });
          if (!purchase) throw new Error("找不到這筆 PayPal 額度訂單。");
          const customId = order.purchase_units?.[0]?.custom_id;
          if (customId !== purchase.userId) {
            throw new Error("PayPal 額度訂單與會員帳號不符。");
          }
          if (purchase.status === "COMPLETED") {
            return { userId: purchase.userId, added: false };
          }

          await tx.aiCreditPurchase.update({
            where: { id: purchase.id },
            data: {
              status: "COMPLETED",
              paypalCaptureId: capture.id,
              completedAt: new Date(),
            },
          });
          await tx.aiAllowance.upsert({
            where: { userId: purchase.userId },
            create: { userId: purchase.userId, bonusBalance: purchase.credits },
            update: { bonusBalance: { increment: purchase.credits } },
          });
          return { userId: purchase.userId, added: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("額度入帳交易重試失敗。");
}
