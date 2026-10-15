import type { PaypalOrder } from "@/lib/billing/paypal";
import { FOUNDER_AMOUNT } from "./policy";

export function verifiedFounderCapture(order: PaypalOrder, localOrderId: string) {
  const units = order.purchase_units, captures = units?.[0]?.payments?.captures;
  if (order.status !== "COMPLETED" || units?.length !== 1 || units[0].custom_id !== localOrderId || captures?.length !== 1 || captures[0].status !== "COMPLETED" || captures[0].amount?.currency_code !== "USD" || captures[0].amount?.value !== FOUNDER_AMOUNT) {
    throw new Error("付款尚未完成或金額／訂單不符；未開放付費權益 / Payment incomplete or order mismatch; access not granted");
  }
  return captures[0];
}
