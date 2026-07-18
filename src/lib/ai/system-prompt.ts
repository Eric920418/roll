// 組裝受治理的 system prompt：政策 + 公司索引 + ROLL ON 事實 + 個人化 context + 語言規則。
// 兩個介面共用：mode="copilot"（會員即時對話）與 mode="inbox-reply"（後台起草回覆潛在客戶）。
//
// 回傳「結構化 system 區塊陣列」而非單一字串，為的是 prompt caching：
//   區塊 1 = 靜態前綴（角色 + 政策 + 事實 + 公司索引），每次請求完全相同 → 標 cache_control 快取，大幅降本。
//   區塊 2 = 動態內容（模式框架 + 語言規則 + 個人化 / 來信），每次不同 → 不快取。
// 快取以「前綴」為單位，故靜態內容必須排在最前面且逐位元組相同。
import type Anthropic from "@anthropic-ai/sdk";
import type { Account } from "@/lib/auth/account";
import { buildPolicyBlock } from "./policy";
import { getRollOnFacts } from "./roll-on-facts";
import { buildCompanyIndex } from "./knowledge";

export type AiMode = "copilot" | "inbox-reply";

function languageRule(locale: string | undefined): string {
  return locale === "zh-tw"
    ? "Reply in Traditional Chinese (繁體中文)."
    : "Reply in the same language the user writes in (English or Traditional Chinese).";
}

/** 會員 profile → 個人化 context。用來讓答覆貼合該會員的公司/產業/需求。 */
function memberContext(profile: Account["profile"]): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.companyName) parts.push(`company: ${profile.companyName}`);
  if (profile.industry) parts.push(`industry: ${profile.industry}`);
  if (profile.companySize) parts.push(`size: ${profile.companySize}`);
  if (profile.country) parts.push(`home country: ${profile.country}`);
  if (profile.targetMarkets?.length)
    parts.push(`target markets: ${profile.targetMarkets.join(", ")}`);
  if (profile.needs?.length) parts.push(`needs: ${profile.needs.join(", ")}`);
  if (profile.timeline) parts.push(`timeline: ${profile.timeline}`);
  if (profile.budgetRange) parts.push(`budget: ${profile.budgetRange}`);
  if (parts.length === 0) return "";
  return [
    "## Who you are talking to (tailor your answer to them)",
    parts.map((p) => `- ${p}`).join("\n"),
    "Prioritize companies and advice relevant to their industry and target markets.",
  ].join("\n");
}

function copilotRole(): string {
  return [
    "You are chatting live with a logged-in member inside their ROLL ON dashboard.",
    "Be practical, concrete, and concise. Give actionable answers focused on their Taiwan / Asia expansion.",
  ].join(" ");
}

function inboxRole(lead: { name: string; message: string }): string {
  return [
    "You are drafting a reply, on behalf of the ROLL ON team, to a prospect who submitted the website contact form.",
    "Write a ready-to-send, warm, professional email body. Address the prospect by name, directly answer what they asked,",
    "briefly note how ROLL ON can help (only from the ROLL ON facts), and propose one concrete next step (e.g. a short intro call).",
    "Do not invent facts, prices, or company figures. Sign off as \"The ROLL ON Team\".",
    "Output ONLY the email body — no subject line, no notes to yourself, no markdown headings.",
    "",
    "## Prospect",
    `Name: ${lead.name}`,
    "Their message:",
    `"""\n${lead.message}\n"""`,
  ].join("\n");
}

/** 靜態前綴：每次請求相同，供 prompt caching。與 mode / locale / 使用者無關。 */
function staticPrefix(): string {
  return [
    "You are ROLL ON's AI assistant. ROLL ON is a Taipei-based consultancy that helps companies enter and grow across Taiwan and Asia.",
    "Before quoting any company fact or figure, call the get_company_profile tool to fetch the real data — never state a company number from memory.",
    "",
    buildPolicyBlock(),
    "",
    "## ROLL ON facts (describe ROLL ON only from here)",
    getRollOnFacts(),
    "",
    "## Company index — the Taiwan-listed companies you can look up",
    "To answer anything specific about one of these, call get_company_profile with its slug.",
    buildCompanyIndex(),
  ].join("\n");
}

export function buildSystemPrompt(opts: {
  mode: AiMode;
  locale?: string;
  memberProfile?: Account["profile"];
  lead?: { name: string; message: string };
}): Anthropic.TextBlockParam[] {
  const role =
    opts.mode === "inbox-reply"
      ? inboxRole(opts.lead ?? { name: "there", message: "" })
      : copilotRole();

  const personalization =
    opts.mode === "copilot" ? memberContext(opts.memberProfile ?? null) : "";

  const dynamic = [role, languageRule(opts.locale), personalization]
    .filter((s) => s !== "")
    .join("\n\n");

  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: staticPrefix(),
      cache_control: { type: "ephemeral" },
    },
  ];
  if (dynamic) blocks.push({ type: "text", text: dynamic });
  return blocks;
}
