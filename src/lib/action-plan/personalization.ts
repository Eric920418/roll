import { z } from "zod";

export const personalizationSchema = z.object({
  payingCustomers: z.enum(["none", "1-5", "6-20", "21+"]),
  interviews: z.enum(["none", "1-5", "6-15", "16+"]),
  channel: z.enum(["referrals", "outreach", "events", "marketing", "not_started"]),
  weeklyTime: z.enum(["under3", "3to8", "8to15", "over15"]),
  goal: z.enum(["validate", "first_order", "steady_customers", "fundraising"]),
}).strict();
export type Personalization = z.infer<typeof personalizationSchema>;
type Locale = "en" | "zh-tw";
const words = (zh: string, en: string) => ({ "zh-tw": zh, en });
export const PERSONALIZATION_QUESTIONS = [
  { key: "payingCustomers", title: words("你目前有幾個付費客戶？", "How many paying customers do you currently have?"), options: [
    ["none", words("還沒有", "None yet")], ["1-5", words("1–5 個", "1–5")], ["6-20", words("6–20 個", "6–20")], ["21+", words("21 個以上", "21 or more")],
  ] },
  { key: "interviews", title: words("你已經和幾位潛在客戶深入聊過需求？", "How many potential customers have you had in-depth conversations with?"), options: [
    ["none", words("還沒有", "None yet")], ["1-5", words("1–5 位", "1–5")], ["6-15", words("6–15 位", "6–15")], ["16+", words("16 位以上", "16 or more")],
  ] },
  { key: "channel", title: words("你現在主要靠什麼方式找到客戶？", "How do you primarily find customers today?"), options: [
    ["referrals", words("朋友或人脈介紹", "Referrals and personal network")], ["outreach", words("主動開發（Email、電話、LinkedIn）", "Outreach (email, phone, LinkedIn)")], ["events", words("活動和展會", "Events and trade shows")], ["marketing", words("網路行銷", "Online marketing")], ["not_started", words("還沒開始", "Not started yet")],
  ] },
  { key: "weeklyTime", title: words("你每週能花多少時間開發客戶？", "How much time can you spend on customer development each week?"), options: [
    ["under3", words("少於 3 小時", "Under 3 hours")], ["3to8", words("3 至未滿 8 小時", "3 to under 8 hours")], ["8to15", words("8–15 小時", "8–15 hours")], ["over15", words("超過 15 小時", "Over 15 hours")],
  ] },
  { key: "goal", title: words("接下來 30 天，你最想完成什麼？", "What matters most over the next 30 days?"), options: [
    ["validate", words("確認市場真的有需求", "Validate market demand")], ["first_order", words("拿到第一筆訂單", "Win a first order")], ["steady_customers", words("增加穩定客戶", "Build a steady customer base")], ["fundraising", words("準備募資資料", "Prepare fundraising materials")],
  ] },
] as const;
export function personalizationResponses(value: Personalization, locale: Locale) {
  return PERSONALIZATION_QUESTIONS.map(q => ({ question: q.title[locale], answer: q.options.find(option => option[0] === value[q.key])![1][locale] }));
}
export function personalizationRoute(value: Personalization) {
  if (value.payingCustomers === "6-20" || value.payingCustomers === "21+") return "sales";
  if (value.payingCustomers === "none" && value.interviews === "none") return "interviews";
  return value.payingCustomers === "none" ? "first_order" : "steady_customers";
}
export function personalizedSteps(value: Personalization, locale: Locale) {
  const w = (zh: string, en: string) => locale === "zh-tw" ? zh : en;
  const route = personalizationRoute(value);
  const contacts = value.weeklyTime === "under3" ? 2 : value.weeklyTime === "3to8" ? 5 : 10;
  const channel = PERSONALIZATION_QUESTIONS[2].options.find(o => o[0] === value.channel)![1][locale];
  const steps = route === "interviews" ? [
    w("訪談 3 間公司，記錄需求與付費意願", "Talk with 3 companies about needs and willingness to pay"),
    w("比對買方回饋，列出有原話依據的需求", "Compare buyer feedback and list needs supported by direct quotes"),
  ] : route === "sales" ? [
    w("整理現有銷售流程與最常停住的環節", "Map the current sales process and where deals stall"),
    w("比較現有買方，選定下一批最適合的客群條件", "Compare current buyers and define the next customer profile"),
  ] : [
    w("整理已存買方證據與既有客戶，選出最有意願的跟進對象", "Review saved buyer evidence and existing customers to prioritize follow-ups"),
    route === "first_order" ? w("向有意願的買方提供具體報價", "Send a concrete quote to an interested buyer") : w("整理第一批客戶的購買原因與續購條件", "Document why early customers bought and would buy again"),
  ];
  steps.push(w(`透過${channel}聯絡 ${contacts} 位符合條件的買方`, `Contact ${contacts} qualified buyers through ${channel}`));
  steps.push(value.goal === "validate" ? w("比對回覆與付費意願，確認或修正需求假設", "Review replies and willingness to pay to refine the demand hypothesis") : value.goal === "steady_customers" ? w("向現有客戶提出續購或推薦邀請，記錄回覆", "Ask existing customers about repeat purchases or referrals and record replies") : w("跟進報價，取得實收或已簽署的付費承諾", "Secure a paid commitment through payment or a signed paid contract"));
  steps.push(value.goal === "fundraising" ? w("整理募資資料與驗證證據，檢查投資人分享設定", "Prepare fundraising materials and evidence, and review investor sharing settings") : w("整理本輪真實成果與未驗證假設，確認下一階段", "Review actual results and unverified assumptions before the next phase"));
  return steps;
}

export function personalizedActions(value: Personalization, locale: Locale, diagnosis: import("./schemas").Diagnosis): import("./schemas").GeneratedAction[] {
  const lowTime = value.weeklyTime === "under3";
  const reason = locale === "zh-tw" ? "依本次五題回答安排；自填人數尚未經紀錄驗證。" : "Based on your five answers; reported counts are not verified evidence.";
  return personalizedSteps(value, locale).map((title, i) => ({
    clientKey: `task_${i + 1}`, title, impact: i === 0 ? "High" : "Medium", urgencyType: "scheduled", urgencyDays: (i + 1) * (lowTime ? 7 : 5),
    dependencyLevel: i ? 1 : 0, dependencyNotes: i ? (locale === "zh-tw" ? "先完成前一項並記錄實際結果。" : "Complete the prior step and record actual results first.") : null,
    dependsOnKeys: i ? [`task_${i}`] : [], difficulty: 2, actionTime: { minMinutes: 30, maxMinutes: lowTime ? 90 : 120 },
    companyStage: diagnosis.companyStage, stageFit: { score: 4, reason, confidence: null }, bottleneckGroup: diagnosis.bottleneckGroup, bottleneckCode: diagnosis.bottleneckCode,
    bottleneckFit: { score: 4, reason, confidence: null }, outcomeCategory: value.goal === "fundraising" && i === 4 ? "fundraising" : "customers",
    expectedOutcome: locale === "zh-tw" ? `完成「${title}」，儲存實際紀錄；未得到回覆或付款也照實記錄，不視為成交。` : `Complete “${title}” and save actual results. Record missing replies or payments honestly; they do not count as sales.`,
    outcomeTime: { min: 1, max: (i + 1) * (lowTime ? 7 : 5) },
  }));
}
