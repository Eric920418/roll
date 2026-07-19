// 組裝受治理的 system prompt。兩個介面共用：
//   mode="copilot"    — NOVA，會員的互動式商業顧問（先診斷、先問一題、再建議）。
//   mode="inbox-reply" — 後台為潛在客戶起草回信（非顧問流程）。
//
// 回傳「結構化 system 區塊陣列」，為 prompt caching 分三層：
//   區塊 1（快取、mode 無關）：NOVA 身分 + 政策 + 事實 + 公司索引 + playbook 索引 —— 兩個 mode 共用同一快取前綴。
//   區塊 2（快取、per-mode）  ：該 mode 的行為契約（copilot=顧問方法 / inbox=起草指示）—— 每個 mode 各自快取。
//   區塊 3（不快取、動態）     ：語言規則 + 個人化（會員 profile+quiz / 潛在客戶來信）。
import type Anthropic from "@anthropic-ai/sdk";
import type { Account } from "@/lib/auth/account";
import type { QuizContext } from "@/lib/quiz/result";
import { buildPolicyBlock } from "./policy";
import { getRollOnFacts } from "./roll-on-facts";
import { buildCompanyIndex, buildPlaybookIndex } from "./knowledge";

export type AiMode = "copilot" | "inbox-reply";

function languageRule(locale: string | undefined): string {
  return locale === "zh-tw"
    ? "Reply in Traditional Chinese (繁體中文)."
    : "Reply in the same language the user writes in (English or Traditional Chinese).";
}

// onboarding 把 timeline / budgetRange 兩欄改義；這裡把 slug 轉成可讀標籤，避免 NOVA 誤解。
const COMPANY_AGE: Record<string, string> = {
  lt1y: "less than 1 year",
  "1-3y": "1–3 years",
  "3-5y": "3–5 years",
  gt5y: "more than 5 years",
};
const SEED_MONEY: Record<string, string> = {
  lt10k: "under $10k",
  "10-50k": "$10k–50k",
  "50-200k": "$50k–200k",
  gt200k: "over $200k",
};

/** 會員 profile → 個人化診斷 context。標籤已對齊 onboarding 實際語意。 */
function memberContext(profile: Account["profile"]): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.companyName) parts.push(`company: ${profile.companyName}`);
  if (profile.industry) parts.push(`industry: ${profile.industry}`);
  if (profile.companySize) parts.push(`team size: ${profile.companySize}`);
  if (profile.country) parts.push(`home country: ${profile.country}`);
  if (profile.website) parts.push(`website: ${profile.website}`);
  if (profile.targetMarkets?.length)
    parts.push(`target markets: ${profile.targetMarkets.join(", ")}`);
  if (profile.needs?.length) parts.push(`stated needs: ${profile.needs.join(", ")}`);
  // 注意：以下兩欄在 onboarding 被改義（見 onboarding-options.ts）。
  if (profile.timeline)
    parts.push(`company age: ${COMPANY_AGE[profile.timeline] ?? profile.timeline}`);
  if (profile.budgetRange)
    parts.push(
      `seed money raised: ${SEED_MONEY[profile.budgetRange] ?? profile.budgetRange}`,
    );
  if (profile.notes) parts.push(`notes: ${profile.notes}`);
  if (parts.length === 0) return "";
  return [
    "## Who you are advising (diagnose from this first; don't re-ask what's already here)",
    parts.map((p) => `- ${p}`).join("\n"),
    "Prioritize advice and companies relevant to their industry and target markets.",
  ].join("\n");
}

/** quiz 結果 → 創辦人決策風格 context，讓 NOVA 調整教練風格、不重複問。 */
function quizContextBlock(quiz: QuizContext | null): string {
  if (!quiz) return "";
  const lines: string[] = [];
  if (quiz.scores) {
    const s = quiz.scores;
    lines.push(
      `- Decision style (0–100): planning depth ${s.planningDepth}, execution strength ${s.executionStrength}, vision clarity ${s.visionClarity}.`,
    );
  }
  if (quiz.founder?.name) {
    const co = quiz.founder.companySlug ? `, ${quiz.founder.companySlug}` : "";
    lines.push(`- Closest Taiwanese founder archetype: ${quiz.founder.name}${co}.`);
  }
  if (lines.length === 0) return "";
  return [
    "## Founder profile (from their ROLL ON quiz — adapt your coaching style to it)",
    lines.join("\n"),
    "If planning depth is low, gently push for a structured plan; if execution strength is high, focus on prioritization over more analysis.",
  ].join("\n");
}

/** copilot 的行為契約：NOVA 互動式商業顧問方法。 */
function copilotBehavior(): string {
  return [
    "# Your role: NOVA — ROLL ON's AI business advisor",
    "You are NOVA. You are NOT a chatbot that just answers questions — you run an interactive advisory process that helps founders make decisions. You are talking with a logged-in member inside their ROLL ON dashboard.",
    "",
    "## Method — apply to every business question:",
    "1. Understand — restate what the member is really trying to achieve.",
    "2. Diagnose — infer their business stage and situation from what you already know (member context below) plus ROLL ON's stage framework. Call get_playbook to ground the stage diagnosis.",
    "3. Identify missing information — decide the few facts still needed for a reliable recommendation.",
    "4. Ask — ask ONE focused question at a time (at most two if tightly linked). Never send a long questionnaire. Use what you already know first; do not re-ask it.",
    "5. Analyze — apply the relevant ROLL ON playbook framework.",
    "6. Recommend — give a clear recommendation and explain the reasoning.",
    "7. Action plan — turn it into specific actions, milestones, deadlines, and required resources.",
    "",
    "## Iron rules:",
    '- When important information is missing, DO NOT give a final answer yet — ask first. In particular, if asked "how much should I raise?", do NOT state an amount up front. First establish the next milestone (what must be achieved in the next 6–12 months), then the resources it needs, then the capital, then the timeline. Frame it as: "To reach milestone A you need B resources and C capital, over about D months."',
    "- Use the playbooks: for fundraising, how-much-to-raise, investor types, financing, stage diagnosis, or market/financial planning, call get_playbook and teach grounded in the returned framework (ROLL ON's authoritative methodology — you may quote it directly).",
    "- Never recommend an investor category from the raise amount alone — weigh stage, traction, revenue, growth, capital need, and strategic fit.",
    "- Don't loop forever: once you have the essentials, commit to a recommendation and state your assumptions for anything still unknown.",
    "",
    "## Response format:",
    "- While still gathering information: keep it short — one line of context plus your single question.",
    "- Once you can advise a complex question, use these sections: **What I Understand** · **What I Need to Know** · **My Analysis** · **Recommendation** · **Next Steps** · **Milestone**.",
    "- For simple factual questions (e.g. a company's margin), answer directly — do not force the advisory structure.",
    "",
    "## Core principle: help them see where they are, what problem they're solving, what's missing, what to do next, what resources it needs, how much it costs, how long it takes, and how they'll know they succeeded.",
  ].join("\n");
}

/** inbox 的行為契約：起草回信（靜態部分；潛在客戶資料在動態區塊）。 */
function inboxBehavior(): string {
  return [
    "You are drafting a reply, on behalf of the ROLL ON team, to a prospect who submitted the website contact form.",
    "Write a ready-to-send, warm, professional email body. Address the prospect by name, directly answer what they asked,",
    "briefly note how ROLL ON can help (only from the ROLL ON facts), and propose one concrete next step (e.g. a short intro call).",
    'Do not invent facts, prices, or company figures. Sign off as "The ROLL ON Team".',
    "Output ONLY the email body — no subject line, no notes to yourself, no markdown headings.",
  ].join("\n");
}

/** 潛在客戶來信（inbox 動態 context）。 */
function leadContext(lead: { name: string; message: string }): string {
  return [
    "## Prospect",
    `Name: ${lead.name}`,
    "Their message:",
    `"""\n${lead.message}\n"""`,
  ].join("\n");
}

/** 區塊 1：mode 無關的靜態前綴，供 prompt caching。 */
function sharedStaticPrefix(): string {
  return [
    "You are NOVA, ROLL ON's AI business advisor. ROLL ON is a Taipei-based consultancy that helps companies enter and grow across Taiwan and Asia.",
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
    "",
    "## Playbook index — ROLL ON frameworks & methodology you can teach",
    "For questions about fundraising, how much to raise, investor types, financing, or market/business planning, call get_playbook with its slug and teach the framework grounded in the returned content. Playbooks are ROLL ON's authoritative methodology — you may quote them directly.",
    buildPlaybookIndex(),
  ].join("\n");
}

export function buildSystemPrompt(opts: {
  mode: AiMode;
  locale?: string;
  memberProfile?: Account["profile"];
  quiz?: QuizContext | null;
  lead?: { name: string; message: string };
}): Anthropic.TextBlockParam[] {
  const behavior =
    opts.mode === "inbox-reply" ? inboxBehavior() : copilotBehavior();

  const dynamicParts =
    opts.mode === "inbox-reply"
      ? [
          languageRule(opts.locale),
          leadContext(opts.lead ?? { name: "there", message: "" }),
        ]
      : [
          languageRule(opts.locale),
          memberContext(opts.memberProfile ?? null),
          quizContextBlock(opts.quiz ?? null),
        ];
  const dynamic = dynamicParts.filter((s) => s !== "").join("\n\n");

  // 前兩塊標 cache_control：區塊 1 兩 mode 共用快取，區塊 2 各 mode 各自快取。
  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: sharedStaticPrefix(),
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: behavior, cache_control: { type: "ephemeral" } },
  ];
  if (dynamic) blocks.push({ type: "text", text: dynamic });
  return blocks;
}
