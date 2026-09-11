import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { USER_SESSION_COOKIE } from "@/lib/auth/session";
import { ok, unauthorized, failFromError } from "@/lib/api";
import { isPaypalConfigured, cancelSubscription } from "@/lib/billing/paypal";
import { del } from "@vercel/blob";

export async function POST() {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      include: { investorPortal: { select: { businessPlanPath: true } } },
    });
    if (!user) return unauthorized();

    // best-effort 取消 PayPal 訂閱，避免刪帳號後仍被扣款（未設定金鑰則略過）
    if (user.paypalSubscriptionId && isPaypalConfigured()) {
      try {
        await cancelSubscription(user.paypalSubscriptionId);
      } catch {
        /* best-effort：取消失敗不擋刪除 */
      }
    }

    // 私密文件必須先成功清除，否則不得假裝帳號已完整刪除。
    if (user.investorPortal?.businessPlanPath) {
      const blobToken = process.env.INVESTOR_BLOB_READ_WRITE_TOKEN;
      if (!blobToken) {
        throw new Error("無法刪除帳號：Investor Private Blob 尚未設定，請聯絡客服。");
      }
      await del(user.investorPortal.businessPlanPath, { token: blobToken });
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
