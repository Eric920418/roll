import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { USER_SESSION_COOKIE } from "@/lib/auth/session";
import { ok, unauthorized, failFromError } from "@/lib/api";
import { isPaypalConfigured, cancelSubscription } from "@/lib/billing/paypal";

export async function POST() {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const user = await prisma.user.findUnique({ where: { id: session.uid } });
    if (!user) return unauthorized();

    // best-effort 取消 PayPal 訂閱，避免刪帳號後仍被扣款（未設定金鑰則略過）
    if (user.paypalSubscriptionId && isPaypalConfigured()) {
      try {
        await cancelSubscription(user.paypalSubscriptionId);
      } catch {
        /* best-effort：取消失敗不擋刪除 */
      }
    }

    // cascade 連帶刪除 profile / quizSubmissions / subscriptions
    await prisma.user.delete({ where: { id: session.uid } });

    const res = ok({ deleted: true });
    res.cookies.set(USER_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (error) {
    return failFromError(error);
  }
}
