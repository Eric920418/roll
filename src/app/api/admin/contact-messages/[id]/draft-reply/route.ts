import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { checkRateLimit, clientIp, MINUTE_MS } from "@/lib/rate-limit";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { runGroundedChat } from "@/lib/ai/run";

// 後台：為某則聯絡表單訊息產生一份「量身草稿回覆」。
// - admin 守衛（proxy 已保護 /api/admin/*，此處二次確認）。
// - 用同一套治理層（system-prompt + 工具查檔）：mode=inbox-reply，把來信塞進 context。
// - 只產草稿、不寄信（寄信維持人工），回 JSON { draft } 供前端放進可編輯欄。
// - 非串流：後端跑完整段生成後一次回傳；成本以連點限流 + 工具輪數上限收斂。

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    // 成本護欄：避免連點狂產草稿（單一 admin 也可能誤觸）。
    const rl = await checkRateLimit(`draft-reply:${clientIp(req)}`, 20, MINUTE_MS);
    if (!rl.ok) return fail("產生草稿過於頻繁，請稍候再試。", 429);

    const message = await prisma.contactMessage.findUnique({ where: { id } });
    if (!message) return fail("找不到這則訊息", 404);

    // 缺 key 等設定問題 → 回真正的錯誤
    let client: Anthropic;
    try {
      client = new Anthropic();
    } catch (err) {
      return failFromError(err);
    }

    const system = buildSystemPrompt({
      mode: "inbox-reply",
      locale: message.locale ?? undefined,
      lead: { name: message.name, message: message.message },
    });

    let draft = "";
    await runGroundedChat({
      client,
      system,
      messages: [{ role: "user", content: "Draft the reply email body now." }],
      onText: (chunk) => {
        draft += chunk;
      },
      maxTokens: 1500,
    });

    const text = draft.trim();
    if (!text) return fail("AI 未產生任何內容，請重試。", 502);
    return ok({ draft: text });
  } catch (error) {
    return failFromError(error);
  }
}
