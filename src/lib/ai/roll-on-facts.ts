// ROLL ON 的權威事實（服務 / 理念 / 流程 / 方案）。
// AI 只會照這份內容描述 ROLL ON，因此需與官網一致。內容取自站上文案（messages/*.json 的
// AboutPage / Services）與方案定義（src/lib/billing/plans.ts）。異動服務或價格時同步更新這裡。
//
// 用英文撰寫（模型會依使用者語言翻譯輸出）。

const FACTS = `ROLL ON (Roll Group) is a Taipei-based consultancy that helps companies enter and grow across Taiwan and Asia. Tagline: "From Vision to Big Impacts."

Philosophy (use to convey tone, not as a service list):
- ROLL ON = relentless forward momentum; ROLL UP = hands-on, deeply involved execution; Impact = compete on value, not price.
- The team immerses in the client's product and customer perspective, and works side by side to restore momentum — beyond surface-level advisory.

Core services (describe only these; do not invent others):
- Fundraising — support from angel round to IPO, plus investor access.
- Global expansion — landing foreign companies in Taiwan and expanding them into the wider Asia market.
- Marketing — precision marketing and brand positioning.
- Legal support — company setup and compliance (high-level orientation, not a substitute for a licensed lawyer or accountant).
- Sales channel development — building and expanding distribution channels.
- All Nighter Community — connecting entrepreneurs and investors.
- Market intelligence — a members-only knowledge base of research profiles on Taiwan-listed companies (financials, strategy, risks) to inform expansion and partnership decisions.

How ROLL ON typically works with a client:
1. Discovery — understand the company, its goals, timeline, and target markets.
2. Assessment — evaluate Taiwan/Asia fit and recommend an entry approach, identifying the client's "unfair advantage."
3. Execution — hands-on support across setup, partnerships, fundraising, marketing, and channels.
4. Ongoing advisory — continued guidance as the company scales in the region.

Plans / access (confirm current pricing on the ROLL ON site before quoting exact numbers):
- Free — basic access.
- Pro — self-serve monthly subscription (around NT$590/month); unlocks the AI Copilot and the company research knowledge base.
- Business — self-serve monthly subscription (around NT$890/month); everything in Pro plus more.
- Enterprise — contact sales (not self-serve).

For anything requiring a specialist (specific legal, tax, or deal work), ROLL ON connects the client with the right person on the team. To move forward, invite the person to book an intro consultation with the ROLL ON team via the website contact form.`;

/**
 * 取得 ROLL ON 事實區塊，供 system prompt 引用。
 * 目前不分語言（模型會依回覆語言翻譯）；若日後要中英分版，再加 locale 參數依語系回傳。
 */
export function getRollOnFacts(): string {
  return FACTS;
}
