import { z } from "zod";
import { INDUSTRY_LABELS, industryLabel } from "@/lib/member-options";

type Copy = readonly [string, string];
type Option = readonly [string, Copy];
type Locale = "en" | "zh-tw";
export const worksheetKeys = ["type", "customer", "buyer", "problem", "alternative", "cost", "evidence"] as const;
type Key = typeof worksheetKeys[number];
const unknown = ["unknown", ["還不確定", "Not sure yet"]] as const;
const other = ["other", ["其他（自己填）", "Other (describe it)"]] as const;

export const worksheetQuestions: Record<Key, { label: Copy; title: Copy; hint?: Copy; options: readonly Option[] }> = {
  type: { label: ["客戶類型", "Customer type"], title: ["你猜誰最需要你的產品？", "Who do you think needs your product most?"], options: [
    ["b2b", ["企業（B2B）", "Businesses (B2B)"]], ["b2c", ["個人消費者（B2C）", "Consumers (B2C)"]], ["b2g", ["公部門與機構（B2G）", "Public agencies and institutions (B2G)"]], unknown, other,
  ] },
  customer: { label: ["客戶輪廓", "Customer profile"], title: ["如果這週要找 3 位潛在客戶聊，你會先找誰？", "If you could speak to three potential customers this week, who would you start with?"], hint: ["最多選 2 個。可補充產業、職位，或你在哪裡找得到他們。", "Choose up to two. Add the industry, role, or where you could reach them."], options: [] },
  buyer: { label: ["決策者", "Decision maker"], title: ["誰會決定要不要花錢買這類產品？", "Who decides whether to spend money on a product like yours?"], options: [
    ["owner", ["創辦人或老闆", "Founder or owner"]], ["manager", ["部門主管", "Department head"]], ["user", ["使用者本人", "The user"]], ["budget", ["採購或預算負責人", "Procurement or budget owner"]], unknown, other,
  ] },
  problem: { label: ["核心問題", "Core problem"], title: ["你猜這群客戶最常在哪件事上卡住？", "What do you think this customer group struggles with most?"], hint: ["選最接近的問題。可補充一個情境，例如「月底出報表時，需要手動合併三份試算表」。", "Pick the closest problem and add a specific situation, such as reconciling three spreadsheets at month-end."], options: [
    ["expense", ["成本太高", "Costs too much"]], ["time", ["耗時太久", "Takes too long"]], ["growth", ["營收成長不足", "Revenue is growing too slowly"]], ["inefficient", ["流程效率低", "Inefficient workflow"]], ["resources", ["缺少合適的工具或人", "Missing tools or people"]], unknown, other,
  ] },
  alternative: { label: ["現有替代方案", "Current workaround"], title: ["他們現在怎麼處理這個問題？", "How do they handle this problem today?"], options: [
    ["manual", ["手動做（例如用 Excel）", "Handle it manually (for example, in Excel)"]], ["tools", ["使用其他工具", "Use another tool"]], ["outsource", ["找顧問或外包", "Use a consultant or outsource it"]], ["none", ["先擱著", "Leave it for now"]], unknown, other,
  ] },
  cost: { label: ["目前投入", "Current cost"], title: ["你知道他們現在為這個問題花了多少時間或錢嗎？", "Do you know how much time or money this problem costs them today?"], hint: ["知道的話，可以補上實際例子，例如「每週約 3 小時」。", "If you know, add an example such as “about three hours a week.”"], options: [
    ["time", ["知道花多少時間", "I know the time spent"]], ["money", ["知道花多少錢", "I know the money spent"]], ["both", ["時間和金額都知道", "I know both"]], ["none", ["目前沒有投入", "No current spend or effort"]], ["unknown", ["還不知道", "I don't know yet"]],
  ] },
  evidence: { label: ["證據強度", "Evidence"], title: ["你怎麼知道？目前是推測、有人提過，還是已經有人付費？", "How do you know? Is it a guess, has someone mentioned it, or has someone paid?"], options: [
    ["guess", ["目前只是推測", "It's a guess so far"]], ["interviews", ["有人在實際對話中提過", "Someone raised it in a real conversation"]], ["paid", ["已有客戶付費解決", "A customer has paid to solve it"]],
  ] },
};

const customerGroups: Record<string, readonly Option[]> = {
  b2b: [
    ["startup", ["小型或新創團隊（少於 50 人）", "Small teams and startups (under 50)"]],
    ["small", ["中小企業（50–249 人）", "Mid-sized companies (50–249)"]],
    ["large", ["大型企業（250 人以上）", "Large enterprises (250+)"]],
  ],
  b2c: [
    ["students", ["學生", "Students"]], ["employees", ["上班族", "Employees"]], ["parents", ["家長", "Parents"]], ["independent", ["自由工作者", "Independent workers"]], ["older", ["銀髮族", "Older adults"]],
  ],
  b2g: [
    ["government", ["政府機關", "Government agencies"]], ["education", ["公立學校", "Public schools"]], ["public", ["其他公共機構", "Other public institutions"]],
  ],
};

const entrySchema = z.object({ choices: z.array(z.string().max(30)).max(2), detail: z.string().trim().max(350), industry: z.string().max(30).optional() }).strict();
export const worksheetAnswersSchema = z.partialRecord(z.enum(worksheetKeys), entrySchema);
export const worksheetCardDraftSchema = z.object({
  who: z.string().max(800),
  hypothesis: z.string().max(1600),
  question: z.string().max(800),
}).strict();
export const worksheetCardSchema = worksheetCardDraftSchema.extend({
  who: worksheetCardDraftSchema.shape.who.trim().min(1),
  hypothesis: worksheetCardDraftSchema.shape.hypothesis.trim().min(3),
  question: worksheetCardDraftSchema.shape.question.trim().min(1),
});
export const savedWorksheetSchema = z.object({
  answers: worksheetAnswersSchema,
  card: worksheetCardSchema,
  revision: z.number().int().min(1),
  locale: z.enum(["en", "zh-tw"]),
}).strict();
export type WorksheetAnswers = z.infer<typeof worksheetAnswersSchema>;
export type WorksheetCard = z.infer<typeof worksheetCardSchema>;
export type SavedWorksheet = z.infer<typeof savedWorksheetSchema>;
export type WorksheetEntry = z.infer<typeof entrySchema>;
export const copy = (value: Copy, locale: Locale) => value[locale === "zh-tw" ? 0 : 1];

export function worksheetOptions(key: Key, answers: WorksheetAnswers) {
  if (key !== "customer") return worksheetQuestions[key].options;
  const type = answers.type?.choices[0] || "";
  return [...(Object.hasOwn(customerGroups, type) ? customerGroups[type] : []), unknown, other];
}

export function worksheetAnswerValid(key: Key, answers: WorksheetAnswers) {
  const entry = answers[key];
  if (!entry?.choices.length || entry.choices.length > (key === "customer" ? 2 : 1)) return false;
  const options = worksheetOptions(key, answers);
  return new Set(entry.choices).size === entry.choices.length
    && entry.choices.every(choice => options.some(([id]) => id === choice))
    && (!entry.choices.includes("unknown") || entry.choices.length === 1)
    && (!entry.industry || key === "customer" && answers.type?.choices[0] === "b2b" && Object.hasOwn(INDUSTRY_LABELS, entry.industry))
    && (!entry.choices.includes("other") || Boolean(entry.detail.trim()));
}

export function worksheetAnswerText(key: Key, answers: WorksheetAnswers, locale: Locale) {
  const entry = answers[key];
  if (!entry) return "";
  const choices = worksheetOptions(key, answers).filter(([id]) => entry.choices.includes(id) && !["unknown", "other"].includes(id));
  return [...choices.map(([, label]) => copy(label, locale)), entry.industry ? industryLabel(entry.industry, locale) : "", entry.detail].filter(Boolean).join(copy(["、", ", "], locale));
}

export function worksheetNextAction(answers: WorksheetAnswers, locale: Locale) {
  const evidence = answers.evidence?.choices[0];
  if (evidence === "paid") return copy(["找一位已付費的客戶，問他當時為什麼決定付錢。", "Speak to a paying customer and ask what made them decide to pay."], locale);
  if (evidence === "interviews") return copy(["找一位還沒談過、符合輪廓的客戶，確認他是否也遇到同樣的問題。", "Speak to someone new who fits the profile and check whether they have the same problem."], locale);
  return copy(["找一位最接近這個輪廓的人，請對方描述最近一次遇到這個問題的經過。", "Find someone who fits the profile and ask them to walk you through the last time it happened."], locale);
}

export function buildWorksheetCard(answers: WorksheetAnswers, locale: Locale): WorksheetCard {
  const get = (key: Key) => worksheetAnswerText(key, answers, locale);
  const target = get("customer") || get("type");
  const problem = get("problem"), alternative = get("alternative");
  const zh = locale === "zh-tw";
  const hypothesis = [
    problem ? (zh ? `我猜這群客戶遇到的問題是「${problem}」。` : `I think this customer group faces this problem: ${problem}.`)
      : copy(["我還不確定他們最想解決什麼，需要先找到具體情境。", "I still need to learn which problem they face in practice."], locale),
    alternative ? (zh ? `他們目前可能靠「${alternative}」處理。` : `They may currently handle it this way: ${alternative}.`) : "",
  ].filter(Boolean).join(zh ? "" : " ");
  const question = answers.evidence?.choices[0] === "paid"
    ? copy(["你上次為了解決這個問題付費時，哪件事讓你決定花這筆錢？", "The last time you paid to solve this, what made it worth spending money on?"], locale)
    : copy(["可以說說最近一次遇到這個問題的情況嗎？那次怎麼處理，最後花了多少時間或錢？", "Can you walk me through the last time this happened? How did you handle it, and what did it cost in time or money?"], locale);
  return { who: target || copy(["客群待確認，先從一位可能遇到這個問題的人開始。", "Customer group to confirm. Start with one person who might face the problem."], locale), hypothesis, question };
}
