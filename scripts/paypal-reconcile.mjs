// 唯讀比對本機 DB 與 PayPal；只有 --apply 才補建缺少的 Subscription 稽核紀錄。
// 不會刪除、取消、降級或改寫 User 權限。

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const apply = process.argv.includes("--apply");
const paypalEnv = process.env.PAYPAL_ENV;
if (!process.env.DATABASE_URL) throw new Error("缺少 DATABASE_URL。");
if (paypalEnv !== "sandbox" && paypalEnv !== "live") {
  throw new Error("PAYPAL_ENV 必須為 sandbox 或 live。");
}
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error("缺少 PayPal API 憑證。");
}

neonConfig.webSocketConstructor = ws;
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const base = paypalEnv === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const planMap = new Map([
  [process.env.PAYPAL_PLAN_ID_PRO_MONTHLY_USD, ["pro", "month", "USD", 4900]],
  [process.env.PAYPAL_PLAN_ID_PRO_YEARLY_USD, ["pro", "year", "USD", 46800]],
  [process.env.PAYPAL_PLAN_ID_BUSINESS_MONTHLY_USD, ["business", "month", "USD", 14900]],
  [process.env.PAYPAL_PLAN_ID_BUSINESS_YEARLY_USD, ["business", "year", "USD", 166800]],
  [process.env.PAYPAL_PLAN_ID_PRO, ["pro", "month", "TWD", null]],
  [process.env.PAYPAL_PLAN_ID_BUSINESS, ["business", "month", "TWD", null]],
].filter(([id]) => id));

async function accessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token 失敗（${res.status}）：${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  const token = await accessToken();
  const users = await prisma.user.findMany({
    where: { paypalSubscriptionId: { not: null } },
    select: { id: true, email: true, paypalSubscriptionId: true },
  });
  let differences = 0;

  for (const user of users) {
    const id = user.paypalSubscriptionId;
    const local = await prisma.subscription.findUnique({ where: { paypalSubscriptionId: id } });
    const res = await fetch(`${base}/v1/billing/subscriptions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.log(`差異 ${user.email}: PayPal 查詢失敗 ${res.status}`);
      differences += 1;
      continue;
    }
    const remote = await res.json();
    const mapped = planMap.get(remote.plan_id);
    if (!mapped) {
      console.log(`差異 ${user.email}: 未知 plan id ${remote.plan_id}`);
      differences += 1;
      continue;
    }
    if (local) continue;

    differences += 1;
    console.log(`缺少 Subscription ${user.email}: ${id} ${remote.status}`);
    if (apply) {
      const [plan, interval, currency, amountMinor] = mapped;
      await prisma.subscription.create({
        data: {
          userId: user.id,
          paypalSubscriptionId: id,
          paypalPlanId: remote.plan_id,
          plan,
          status: remote.status,
          billingInterval: interval,
          currency,
          amountMinor,
          startedAt: remote.start_time ? new Date(remote.start_time) : null,
          currentPeriodEnd: remote.billing_info?.next_billing_time
            ? new Date(remote.billing_info.next_billing_time)
            : null,
        },
      });
      console.log("  已補建稽核紀錄；未修改 User 權限。 ");
    }
  }

  console.log(`${apply ? "套用完成" : "唯讀完成"}：${differences} 個差異。`);
}

main()
  .catch((error) => {
    console.error("✗", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
