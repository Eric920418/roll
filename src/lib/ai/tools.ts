// Anthropic 工具定義 + 執行器。
// 目前只有一個工具：依 slug 取單家公司完整情報（重用 knowledge.renderCompanyForAI）。
// 「找資料」的機制核心 —— 模型要引用任何公司數字/分析，都必須先呼叫這個工具拿到真實資料。
import type Anthropic from "@anthropic-ai/sdk";
import { renderCompanyForAI } from "./knowledge";
import { getCompanyList } from "@/lib/company/content";

export const COMPANY_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_company_profile",
    description:
      "Fetch ROLL ON's full research profile for ONE Taiwan-listed company, by its slug. " +
      "The valid slugs are listed in the company index in the system prompt. " +
      "Returns identity, recent financial metrics (each with its period and source), and the 10 analysis sections. " +
      "Call this whenever the user asks about a specific company's financials, strategy, business model, risks, valuation, history, or outlook. " +
      "Quote figures only from this result, and always cite the period and source.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "The company slug exactly as shown in the company index, e.g. 'grape-king'.",
        },
      },
      required: ["slug"],
    },
  },
];

/**
 * 執行工具，回傳給模型的字串（tool_result 內容）。
 * 找不到 slug 時回列出所有有效 slug，讓模型能自我修正重試。
 */
export function runTool(name: string, input: unknown): string {
  if (name === "get_company_profile") {
    const slug =
      input && typeof input === "object" && "slug" in input
        ? String((input as { slug: unknown }).slug ?? "")
        : "";
    if (!slug) return "Error: missing required argument 'slug'.";
    const rendered = renderCompanyForAI(slug);
    if (rendered) return rendered;
    const valid = getCompanyList()
      .map((c) => c.slug)
      .join(", ");
    return `No company found for slug "${slug}". Valid slugs are: ${valid}`;
  }
  return `Error: unknown tool "${name}".`;
}
