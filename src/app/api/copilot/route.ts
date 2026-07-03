import { type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { fail, unauthorized, failFromError } from "@/lib/api";

// 會員 AI Copilot 串流端點。
// - 守衛：session（401）+ Pro 方案（403，控成本）—— 皆在串流開始前，故能回真正的狀態碼。
// - 一旦開始串流即 committed 200，之後的錯誤只能以文字寫入串流（顯示於前端）。
// - MVP 無 rate limit（成本風險）：以 Pro-gate + 輸入長度/則數上限收斂；正式上線建議加每會員配額。

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

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

function buildSystem(
  locale: string | undefined,
  profile: {
    companyName: string | null;
    industry: string | null;
    needs: string[];
  } | null,
): string {
  const lang =
    locale === "zh-tw"
      ? "Reply in Traditional Chinese (繁體中文)."
      : "Reply in the same language the user writes in (English or Traditional Chinese).";
  const ctx = profile
    ? `Member context — company: ${profile.companyName || "n/a"}; industry: ${profile.industry || "n/a"}; needs: ${profile.needs.join(", ") || "n/a"}.`
    : "";
  return [
    "You are ROLL ON's AI assistant. ROLL ON is a Taipei-based consultancy that helps foreign companies enter the Taiwan and Asia market — market entry, company setup, legal/compliance, fundraising, partnerships, and investor access.",
    "Give practical, concrete, concise answers focused on the member's Taiwan / Asia expansion. If you are unsure or something needs a specialist, say so and suggest contacting the ROLL ON team.",
    lang,
    ctx,
  ]
    .filter(Boolean)
    .join(" ");
}

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

    // 缺 key 等設定問題 → 串流開始前回真正的錯誤（顯示於前端）
    let client: Anthropic;
    try {
      client = new Anthropic();
    } catch (err) {
      return failFromError(err);
    }

    const system = buildSystem(parsed.data.locale, account.profile);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const llm = client.messages.stream({
            model: MODEL,
            max_tokens: 1024,
            system,
            messages: parsed.data.messages,
          });
          for await (const event of llm) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          // 串流已 committed 200 → 錯誤以文字寫入（前端顯示全文，符合專案規範）
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`));
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
