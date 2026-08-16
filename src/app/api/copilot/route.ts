import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { fail, unauthorized, failFromError } from "@/lib/api";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { runGroundedChat } from "@/lib/ai/run";
import { publicCopilotFailureMessage } from "@/lib/ai/public-error";
import { getLatestQuizResult } from "@/lib/quiz/result";

// 會員 AI Copilot 串流端點。
// - 守衛：session（401）+ Pro 方案（403，控成本）+ 每會員每日配額（429）—— 皆在串流開始前，故能回真正的狀態碼。
// - 一旦開始串流即 committed 200，之後的錯誤只能以文字寫入串流（顯示於前端）。
// - 受治理：system prompt / 找資料（工具查檔）/ 個人化皆由 src/lib/ai 統一處理，見該目錄。

const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;
// 成本護欄：每會員每日對話則數上限（DB-based rate limit）。集中常數，易調整。
const COPILOT_DAILY_LIMIT = 50;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(MAX_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
  locale: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const account = await requirePlan("pro");
    if (!account) return fail("此功能需 Pro 以上方案", 403);

    // 每會員每日配額（成本護欄）—— 串流開始前，可回真正的 429。
    const rl = await checkRateLimit(
      `copilot:${session.uid}`,
      COPILOT_DAILY_LIMIT,
      DAY_MS,
    );
    if (!rl.ok) {
      const mins = Math.max(1, Math.ceil(rl.retryAfterMs / 60000));
      return fail(
        `已達本日 AI 對話上限（每日 ${COPILOT_DAILY_LIMIT} 則）。約 ${mins} 分鐘後重試。`,
        429,
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(
        parsed.error.issues
          .map((i) => `${i.path.map(String).join(".") || "欄位"}：${i.message}`)
          .join("；"),
        400,
      );
    }

    // 缺 key 等設定問題 → 串流開始前由共用 5xx 邊界記錄完整例外、回通用訊息。
    let client: Anthropic;
    try {
      client = new Anthropic();
    } catch (err) {
      return failFromError(err);
    }

    // NOVA 診斷先用已知資料：會員 profile + 最新一次 quiz 決策風格。
    const quiz = await getLatestQuizResult(session.uid);
    const system = buildSystemPrompt({
      mode: "copilot",
      locale: parsed.data.locale,
      memberProfile: account.profile,
      quiz,
    });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await runGroundedChat({
            client,
            system,
            messages: parsed.data.messages,
            onText: (chunk) => controller.enqueue(encoder.encode(chunk)),
            // NOVA 的六段顧問結構較長，放寬輸出上限。
            maxTokens: 4000,
          });
        } catch (err) {
          // 串流已 committed 200，後端保留完整證據，前端只收到穩定產品文案。
          console.error("[copilot] upstream stream failed", err);
          controller.enqueue(
            encoder.encode(
              `\n\n${publicCopilotFailureMessage(parsed.data.locale, err)}`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failFromError(error);
  }
}
