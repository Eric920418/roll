import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { feedbackCreateSchema, zodMessage } from "@/lib/dashboard/schemas";
import {
  FEEDBACK_LIMIT_PER_DAY,
  FEEDBACK_WINDOW_MS,
} from "@/lib/dashboard/feedback";

// 問題回報 — 會員送出。
//
// 刻意「不」呼叫 requirePlan()：其他會員工具（CRM / pipeline / notes）是 Pro 限定，
// 但 bug/建議是我們想要更多、不是更少的訊號，把免費會員擋在付費牆後面等於自斷回饋來源。
// 濫用防護改由 rate limit 承擔（每會員每日上限）。
//
// 送出後不開放會員自行修改/刪除：回報是給我們重現問題的事證，且管理員可能已據此回覆，
// 事後被改寫會讓後台的處理紀錄失去意義。要補充內容就再送一則。
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const rl = await checkRateLimit(
      `feedback:${session.uid}`,
      FEEDBACK_LIMIT_PER_DAY,
      FEEDBACK_WINDOW_MS,
    );
    if (!rl.ok) {
      return fail(
        `今日回報已達 ${FEEDBACK_LIMIT_PER_DAY} 則上限，請明天再試，或直接聯絡我們。`,
        429,
      );
    }

    const parsed = feedbackCreateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    // userAgent 由 server 從 header 取（不信 client 傳入），截斷避免異常長 header 灌爆欄位
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) || null;

    const row = await prisma.feedbackReport.create({
      data: {
        userId: session.uid,
        type: d.type,
        title: d.title,
        body: d.body,
        pageUrl: d.pageUrl || null,
        locale: d.locale || null,
        userAgent,
      },
      select: { id: true, createdAt: true },
    });
    return ok(row, 201);
  } catch (error) {
    return failFromError(error);
  }
}
