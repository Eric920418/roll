import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { fail, unauthorized, failFromError } from "@/lib/api";
import { completeAiUsage, reserveAiUsage } from "@/lib/ai/allowance";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { runGroundedChat } from "@/lib/ai/run";
import { publicCopilotFailureMessage } from "@/lib/ai/public-error";
import { getLatestQuizResult } from "@/lib/quiz/result";
import { getActiveActionPlan } from "@/lib/action-plan/service";

// 會員 AI Copilot 串流端點。
// - 守衛：session（401）+ Pro 方案（403）+ 每訂閱月 150 次／加購額度（429）。
// - 一旦開始串流即 committed 200，之後的錯誤只能以文字寫入串流（顯示於前端）。
// - 受治理：system prompt / 找資料（工具查檔）/ 個人化皆由 src/lib/ai 統一處理，見該目錄。

const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;
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
    const client = new Anthropic();

    // NOVA 診斷先用已知資料：會員 profile + 最新一次 quiz 決策風格。
    const [quiz, actionPlan] = await Promise.all([
      getLatestQuizResult(session.uid),
      getActiveActionPlan(session.uid),
    ]);
    const actionPlanContext = actionPlan
      ? [
          `Confirmed company stage: ${actionPlan.diagnosis.companyStage} (${actionPlan.diagnosis.stageReason})`,
          `Confirmed bottleneck: ${actionPlan.diagnosis.bottleneckGroup} · ${actionPlan.diagnosis.bottleneckCode} (${actionPlan.diagnosis.bottleneckReason})`,
          ...actionPlan.nextMoves.map((action) =>
            `#${action.rank} ${action.title} — priority ${action.priorityScore}; outcome: ${action.expectedOutcome.text}`,
          ),
        ].join("\n")
      : undefined;
    const system = buildSystemPrompt({
      mode: "copilot",
      locale: parsed.data.locale,
      memberProfile: account.profile,
      quiz,
      actionPlanContext,
    });

    // 只有所有本機驗證與 context 準備完成後才暫占額度；後續唯一可能失敗的工作
    // 是 Anthropic 串流，finally 會立即確認或釋放 reservation。
    const usageId = await reserveAiUsage(account);
    if (!usageId) {
      return fail(
        "本月 150 次 NOVA 額度與加購次數皆已用完。請前往 Billing 加購 10 次後再試。",
        429,
      );
    }
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let succeeded = false;
        try {
          await runGroundedChat({
            client,
            system,
            messages: parsed.data.messages,
            onText: (chunk) => controller.enqueue(encoder.encode(chunk)),
            // NOVA 的六段顧問結構較長，放寬輸出上限。
            maxTokens: 4000,
          });
          succeeded = true;
        } catch (err) {
          // 串流已 committed 200，後端保留完整證據，前端只收到穩定產品文案。
          console.error("[copilot] upstream stream failed", err);
          controller.enqueue(
            encoder.encode(
              `\n\n${publicCopilotFailureMessage(parsed.data.locale, err)}`,
            ),
          );
        } finally {
          try {
            await completeAiUsage(usageId, succeeded);
          } catch (usageError) {
            console.error("[copilot] allowance completion failed", usageError);
          }
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
