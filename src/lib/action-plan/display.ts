import { MILESTONES, STEPS } from './flow/catalog';
import { DIAGNOSTIC_QUESTIONS } from './builder-draft';
import { taskReference } from './ranking';
import { conversationCopy, shortStepTitle } from './constants';

const legacy = [
    ['Validate ICP through structured customer discovery', '透過結構化客戶訪談，驗證目標客戶輪廓'],
    ['Define and document your ideal customer profile', '定義並記錄目標客戶輪廓'],
    ['Write a positioning statement', '撰寫一句話定位'],
    ['Draft and validate one-sentence ICP positioning statement', '撰寫一句話定位，並向目標客戶驗證'],
    ['Build a lead scorecard', '建立潛在客戶評分卡'],
    ['Build ICP scorecard', '建立目標客戶評分卡'],
    ['Tier your customer leads', '將潛在客戶分級'],
    ['Score and tier interview leads into ICP segments', '依訪談結果評分，將目標客戶分群與分級'],
    ['Identify priority customers', '找出優先聯絡的目標客戶'],
    ['Validate with customer evidence', '依客戶實際回饋驗證'],
    ['Based on saved customer evidence', '依已儲存的客戶佐證判斷'],
    ['Complete a positioning statement and record feedback from three potential customers', '完成一句話定位，並記錄 3 位潛在客戶的回饋'],
  ] as const;

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').replace(/[.!]$/, '').toLowerCase();
const phrases = new Map<string, string>([
  ...DIAGNOSTIC_QUESTIONS.en.map((en, i) => [normalize(en), DIAGNOSTIC_QUESTIONS["zh-tw"][i]] as const),
  ...MILESTONES.map(([zh, en]) => [normalize(en), zh] as const),
  ...STEPS.flatMap(step => [step.title, step.criteria, step.guide].map(([zh, en]) => [normalize(en), zh] as const)),
  ...legacy.map(([en, zh]) => [normalize(en), zh] as const),
]);

for (const [en, zh] of [...phrases]) phrases.set(normalize(conversationCopy(en)), zh);

const units = new Map<string, string>([
    ['companies', '家公司'], ['company', '家公司'], ['candidates', '個候選客群'],
    ['agreed pilots', '位同意試用的客戶'], ['validated statement', '份已驗證定位'],
    ['criteria', '項條件'], ['leads', '位潛在客戶'], ['verified records', '筆有效成果'],
    ['records', '筆紀錄'], ['statement', '份定位'],
  ]);
const english = new Map([...phrases].map(([en, zh]) => [normalize(zh), en]));
// Catalog spelling wins over normalized lookup keys.
for (const [zh, en] of [...MILESTONES, ...STEPS.flatMap(step => [step.title, step.criteria, step.guide]), ...legacy.map(([en, zh]) => [zh, en] as const), ...DIAGNOSTIC_QUESTIONS.en.map((en, i) => [DIAGNOSTIC_QUESTIONS['zh-tw'][i], en] as const)]) english.set(normalize(zh), en);
export function planUnit(value: string, locale: string) {
  return locale === "zh-tw" ? units.get(normalize(value)) || value : [...units].find(([, zh]) => zh === value)?.[0] || value;
}

// Only complete known system phrases are localized; member content and unknown text stay verbatim.
export function planText(value: string, locale: string, translations: Readonly<Record<string, string>> = {}): string {
  const stepTitle = shortStepTitle(value, locale);
  if (stepTitle) return stepTitle;
  if (Object.hasOwn(translations, value)) return translations[value];
  if (locale !== 'zh-tw') {
    const known = english.get(normalize(value));
    return known ? conversationCopy(known) : phrases.has(normalize(value)) || /^interview \d+ (?:startups|founders|target customers|customers)\b/i.test(value) ? conversationCopy(value) : value;
  }
  const text = normalize(value), known = phrases.get(text);
  if (known) return known;
  let match = /^run (?:a )?paid pilot offer with (\d+) prospects(?: to test willingness to pay)?$/.exec(text);
  if (match) return `向 ${match[1]} 位潛在客戶提出付費試用，驗證付費意願`;
  match = /^at least (\d+) of (\d+) prospects? agrees? to a paid pilot(?:, confirming a validated willingness-to-pay price point)?$/.exec(text);
  if (match) return `在 ${match[2]} 位潛在客戶中，至少 ${match[1]} 位同意付費試用，確認對方接受的試用價格。`;
  match = /^interview (\d+) (startups|founders|target customers|customers)(?: on icp pain and willingness to pay)?$/.exec(text);
  if (match) return `訪談 ${match[1]} ${match[2] === 'startups' ? '家新創團隊' : match[2] === 'founders' ? '位創辦人' : '位目標客戶'}${text.includes('willingness to pay') ? '，確認痛點與付費意願' : ''}`;
  match = /^secure (\d+) paying customers$/.exec(text);
  if (match) return `取得 ${match[1]} 位付費客戶`;
  return value;
}

export function displayTaskReference(task: Parameters<typeof taskReference>[0], locale: string, translations: Readonly<Record<string, string>> = {}) {
  const label = taskReference({ ...task, title: planText(task.title, locale, translations), metricUnit: task.metricUnit ? planText(planUnit(task.metricUnit, locale), locale, translations) : task.metricUnit });
  return locale === 'zh-tw' ? label.replace(/^Milestone (\d+) · /, '里程碑 $1 · ') : label;
}
