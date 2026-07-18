// 受治理的對話執行器：串流 + 工具迴圈。
// 兩個介面共用：Copilot 把 onText 灌進 ReadableStream；草稿功能把 onText 累積成字串。
import type Anthropic from "@anthropic-ai/sdk";
import { COMPANY_TOOLS, runTool } from "./tools";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 2048;
// 工具查檔的最大輪數（成本護欄）。達上限後強制一次「無工具」作答收斂。
const DEFAULT_MAX_TOOL_TURNS = 3;

/**
 * 執行一輪對話。text 以 onText 逐塊回吐（呼叫端決定要串流還是累積）。
 * 迴圈：串流一輪 → 若 stop_reason 為 tool_use，執行工具、把結果接回 messages 再跑一輪
 *       → 直到模型不再要工具，或達 maxToolTurns 後強制無工具作答。
 */
export async function runGroundedChat(opts: {
  client: Anthropic;
  system: string | Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  onText: (chunk: string) => void;
  maxTokens?: number;
  maxToolTurns?: number;
}): Promise<void> {
  const { client, system, onText } = opts;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxToolTurns = opts.maxToolTurns ?? DEFAULT_MAX_TOOL_TURNS;
  const messages: Anthropic.MessageParam[] = [...opts.messages];

  async function streamOnce(withTools: boolean): Promise<Anthropic.Message> {
    const s = client.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      ...(withTools ? { tools: COMPANY_TOOLS } : {}),
    });
    for await (const event of s) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onText(event.delta.text);
      }
    }
    return s.finalMessage();
  }

  for (let turn = 0; turn < maxToolTurns; turn++) {
    const msg = await streamOnce(true);
    if (msg.stop_reason !== "tool_use") return;

    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) return;

    // 把這一輪 assistant 訊息（含 tool_use）與 tool_result 接回對話，供下一輪讀取。
    messages.push({
      role: "assistant",
      content: msg.content as Anthropic.ContentBlockParam[],
    });
    messages.push({
      role: "user",
      content: toolUses.map((tu) => ({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: runTool(tu.name, tu.input),
      })),
    });
  }

  // 達工具上限仍想查檔 → 強制一次無工具作答，讓它用手上資料收斂（防無限迴圈）。
  await streamOnce(false);
}
