import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { getEffectivePlan } from "@/lib/billing/gate";
import { getCurrentAccount } from "@/lib/auth/account";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { fail, ok, unauthorized, failFromError } from "@/lib/api";
import { completeAiUsage, reserveAiUsage } from "@/lib/ai/allowance";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { runGroundedChat } from "@/lib/ai/run";
import { publicCopilotFailureMessage } from "@/lib/ai/public-error";
import { getLatestQuizResult } from "@/lib/quiz/result";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { prisma } from "@/lib/prisma";

// 會員 AI Copilot 串流端點。
// - 守衛：session（401）+ 對話額度（429）；免費會員僅可用獎勵，付費依 included/reward/bonus 消耗。
// - 一旦開始串流即 committed 200，之後的錯誤只能以文字寫入串流（顯示於前端）。
// - 受治理：system prompt / 找資料（工具查檔）/ 個人化皆由 src/lib/ai 統一處理，見該目錄。

const MAX_CHARS = 4000;
const bodySchema = z.object({
  message: z.string().trim().min(1).max(MAX_CHARS),
  locale: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const account = await getCurrentAccount();
    if (!account) return unauthorized();
    const paid = getEffectivePlan(account) !== "free";
    const turns = await prisma.copilotTurn.findMany({
      where: { userId: session.uid, ...(!paid ? { rewardOnly: true } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true, question: true, answer: true },
    });
    const response = ok(turns.reverse());
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return failFromError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const account = await getCurrentAccount();
    if (!account) return unauthorized();
    const paid = getEffectivePlan(account) !== "free";
    if (!(await checkRateLimit(`copilot:${session.uid}`, 10, MINUTE_MS, false)).ok) return fail("請求過於頻繁，請稍後重試 / Too many requests; retry shortly", 429);

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
    const priorTurns = await prisma.copilotTurn.findMany({
      where: { userId: session.uid, answer: { not: null }, ...(!paid ? { rewardOnly: true } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 14,
      select: { question: true, answer: true },
    });
    const history = priorTurns.reverse().flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      { role: "assistant" as const, content: turn.answer! },
    ]);
    history.push({ role: "user", content: parsed.data.message });

    // NOVA 診斷先用已知資料：會員 profile + 最新一次 quiz 決策風格。
    const [quiz, actionPlan] = await Promise.all([
      getLatestQuizResult(session.uid),
      paid ? getActiveActionPlan(session.uid) : Promise.resolve(null),
    ]);
    const actionPlanContext = actionPlan
      ? [
          `Confirmed company stage: ${actionPlan.diagnosis.companyStage} (${actionPlan.diagnosis.stageReason})`,
          `Confirmed bottleneck: ${actionPlan.diagnosis.bottleneckGroup} · ${actionPlan.diagnosis.bottleneckCode} (${actionPlan.diagnosis.bottleneckReason})`,
          ...(actionPlan.roadmap ? [`Goal roadmap (member-confirmed plan, not a promise): ${JSON.stringify(actionPlan.roadmap)}. Task progress is not proof of business outcomes. Only achievedAt means the member confirmed the result; awaiting means ask them to confirm, unplanned means offer next-stage generation.`] : []),
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
    const usageId = await reserveAiUsage(account, "copilot");
    if (!usageId) {
      return fail(
        paid ? "本月額度、獎勵及加購次數已用完，請前往 Rewards 兌換或 Billing 加購 / No AI credits left; redeem rewards or purchase credits" : "獎勵次數已用完，請前往 Rewards 兌換 / No reward credits left; redeem in Rewards",
        429,
      );
    }
    let turn;
    try {
      turn = await prisma.copilotTurn.create({
        data: { userId: session.uid, question: parsed.data.message, rewardOnly: !paid },
        select: { id: true },
      });
    } catch (error) {
      await completeAiUsage(usageId, false);
      throw error;
    }
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let succeeded = false;
        let answer = "";
        try {
          await runGroundedChat({
            client,
            system,
            messages: history,
            onText: (chunk) => {
              answer += chunk;
              try { controller.enqueue(encoder.encode(chunk)); } catch { /* 頁面切換後仍完成資料庫儲存 */ }
            },
            // NOVA 的六段顧問結構較長，放寬輸出上限。
            maxTokens: 4000,
          });
          if (!answer.trim()) throw new Error("NOVA 未回傳回答");
          await prisma.copilotTurn.update({ where: { id: turn.id }, data: { answer } });
          succeeded = true;
        } catch (err) {
          // 串流已 committed 200，後端保留完整證據，前端只收到穩定產品文案。
          console.error("[copilot] upstream stream failed", err);
          try { controller.enqueue(encoder.encode(`\n\n${publicCopilotFailureMessage(parsed.data.locale, err)}`)); } catch { /* client 已離開 */ }
        } finally {
          try {
            await completeAiUsage(usageId, succeeded);
          } catch (usageError) {
            console.error("[copilot] allowance completion failed", usageError);
          }
          try { controller.close(); } catch { /* client 已離開 */ }
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
