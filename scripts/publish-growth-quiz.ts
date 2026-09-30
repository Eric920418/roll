import { prisma } from "../src/lib/prisma";
import { GROWTH_DIMENSIONS } from "../src/lib/quiz/growth";

const dual = (en: string, zh: string) => ({ en, "zh-tw": zh });
const option = (en: string, zh: string, descEn: string, descZh: string) => ({
  label: dual(en, zh),
  desc: dual(descEn, descZh),
});

// 固定 ID 使此發佈腳本可安全重跑；舊題只隱藏，保留歷史提交的 questionId。
const questions = [
  {
    id: "growth-2026-bottleneck", order: 0, dimension: GROWTH_DIMENSIONS[0],
    prompt: dual("What is your single biggest bottleneck right now?", "你現在最大的單一瓶頸是什麼？"),
    subtitle: dual("Pick the one challenge that is slowing down your momentum.", "選出目前最拖慢進度的一項挑戰。"),
    optionA: option("Clarifying ICP & Market Demand", "釐清理想客戶與市場需求", "I'm not sure who our core customer is or whether the product meets market demand.", "不確定核心客戶是誰、產品是否符合市場需求。"),
    optionB: option("Building a Predictable Sales Pipeline", "建立可預測的銷售管道", "I know our target customers, but lack a steady pipeline and repeatable sales process.", "我知道目標客戶，但缺少穩定客戶、銷售對接與商業流程。"),
    optionC: option("Investor Story & Financial Roadmap", "投資敘事與財務路線圖", "We need a clear 12-month plan and supporting data to convince investors.", "需要明確的 12 個月計畫與數據，說服投資人。"),
    optionD: option("Cross-Border & Market Expansion", "跨境與市場擴張", "We need a new market, APAC entry partners, and local distribution channels.", "需要尋找新市場、亞太落地夥伴與在地經銷通路。"),
  },
  {
    id: "growth-2026-style", order: 1, dimension: GROWTH_DIMENSIONS[1],
    prompt: dual("What is your preferred growth & market entry style?", "你偏好的成長與市場進入方式是什麼？"),
    subtitle: dual("Help NOVA AI tailor your next actions.", "讓 NOVA AI 依你的偏好調整下一步行動建議。"),
    optionA: option("Replicate ROLL ON's Proven Founder Playbooks", "套用 ROLL ON 的創辦人實戰方法", "Apply business strategies that ROLL ON has used successfully.", "套用 ROLL ON 已驗證的商業策略。"),
    optionB: option("Fast Experimentation & Rapid Iteration", "快速實驗與迭代", "Reach customers and investors quickly, then adjust based on real results.", "快速聯繫客戶與投資人，用實測數據修正方向。"),
    optionC: option("Partnership & Distributor Network First", "夥伴與經銷通路優先", "Work with local distributors, partners, and cross-border resources to drive sales.", "結合在地經銷商、合作夥伴與跨境資源，以通路推動銷售。"),
    optionD: option("Data-Driven & ROI-Controlled Risk", "數據驅動與 ROI 風險控管", "Use CRM progress and milestone results to guide investment decisions.", "依據 CRM 進度與里程碑達成情況，改善投資回報。"),
  },
  {
    id: "growth-2026-milestone", order: 2, dimension: GROWTH_DIMENSIONS[2],
    prompt: dual("What key milestone must your team unlock in 12 months?", "你的團隊必須在 12 個月內達成哪個關鍵里程碑？"),
    subtitle: dual("NOVA will use this goal to inform your next actions.", "NOVA 將以此目標調整下一步行動建議。"),
    optionA: option("Secure First International / Enterprise Orders", "取得首筆國際或企業訂單", "Win major overseas or enterprise orders within the year.", "在一年內拿下海外大單或預售訂單。"),
    optionB: option("Close Investment Round (Seed / Series A)", "完成種子輪或 A 輪融資", "Complete a funding round and show traction through the Investor Portal.", "完成融資，並透過投資人入口展示營運進展。"),
    optionC: option("Build an Automated B2B Sales & Pipeline Engine", "建立 B2B 銷售與商機管理系統", "Build a CRM pipeline and a workflow that turns meeting notes into actionable items.", "建立完整 CRM 商機流程，將會議紀錄整理成可執行的行動項目。"),
    optionD: option("Establish Sustainable Expansion into APAC Markets", "在亞太市場建立可持續的營運", "Build a cross-border brand and a stable, profitable local operation.", "建立跨國品牌地位與穩定獲利的在地營運。"),
  },
] as const;

const OLD_PROMPTS = [
  "What would you do first when entering the Taiwan market?",
  "When information is incomplete, what do you usually do?",
  "What is your preferred market entry approach?",
];

async function main() {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.quizQuestion.findMany({
      where: { OR: [{ published: true }, { id: { in: questions.map((q) => q.id) } }] },
      select: { id: true, order: true, dimension: true, prompt: true, published: true },
      orderBy: { order: "asc" },
    });
    const live = existing.filter((q) => q.published);
    if (questions.every((q) => live.some((row) => row.id === q.id)) && live.length === 3) {
      console.log("Growth quiz already published; no changes.");
      return;
    }
    const old = live.filter((q) =>
      q.dimension === "entry-style" && OLD_PROMPTS[q.order] === (q.prompt as { en?: string }).en,
    );
    if (live.length !== 3 || old.length !== 3 || existing.some((q) => questions.some((n) => n.id === q.id))) {
      throw new Error("Quiz questions differ from the reviewed three originals; no changes made.");
    }
    await tx.quizQuestion.createMany({ data: questions.map((q) => ({ ...q, published: true })) });
    const hidden = await tx.quizQuestion.updateMany({
      where: { id: { in: old.map((q) => q.id) }, published: true },
      data: { published: false },
    });
    if (hidden.count !== 3) throw new Error("Could not hide exactly three original questions.");
    console.log("Published three growth questions; preserved three original questions and all submissions.");
  }, { isolationLevel: "Serializable" });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
