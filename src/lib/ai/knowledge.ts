// AI 知識庫接層：把既有的公司情報讀取層（src/lib/company/content.ts）
// 轉成適合塞進 system prompt / 工具回傳的文字。不重造資料層，只做「渲染」。
import { getCompanyList, getCompany, type Metric } from "@/lib/company/content";

/** 每家公司在提示裡的一句話截斷長度，控制索引總長度。 */
const SUMMARY_MAX = 140;
/** 工具回傳時，每個財務指標序列最多帶幾期（由新到舊），避免單次 tool 回應過長。 */
const METRIC_PERIODS = 12;

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function formatValue(value: number, unit: string | null): string {
  // 大額（營收、資產等）加千分位；比率/每股等小數保留原值。
  const num =
    Math.abs(value) >= 10000 ? value.toLocaleString("en-US") : String(value);
  return unit ? `${num} ${unit}` : num;
}

/**
 * 常駐公司索引：53 家各一行（名稱 / 市場:代號 / 產業 / 一句話）。
 * 塞進 system prompt，讓模型知道「知道哪些公司」及各自的 slug（供工具查檔）。
 */
export function buildCompanyIndex(): string {
  const items = getCompanyList();
  if (items.length === 0) return "(No company profiles are currently available.)";
  const lines = items.map((c) => {
    const zh = c.nameZh ? ` ${c.nameZh}` : "";
    const sector = c.sector ? ` — ${c.sector}` : "";
    const summary = c.summaryEn ? ` — ${truncate(c.summaryEn, SUMMARY_MAX)}` : "";
    // slug 一定要露出來，模型才能用 get_company_profile({ slug }) 查檔。
    return `- [slug: ${c.slug}] ${c.nameEn}${zh} (${c.market}:${c.ticker})${sector}${summary}`;
  });
  return lines.join("\n");
}

function renderMetrics(metrics: Metric[]): string {
  if (metrics.length === 0) return "(No metrics available.)";
  // 依 metricKey 分組，每組取最新 METRIC_PERIODS 期（period 為 ISO 樣式字串，字典序即時間序）。
  const byKey = new Map<string, Metric[]>();
  for (const m of metrics) {
    const arr = byKey.get(m.metricKey);
    if (arr) arr.push(m);
    else byKey.set(m.metricKey, [m]);
  }
  const lines: string[] = [];
  for (const [key, arr] of byKey) {
    const recent = [...arr]
      .sort((a, b) => b.period.localeCompare(a.period))
      .slice(0, METRIC_PERIODS);
    const source = recent.find((m) => m.source)?.source;
    const series = recent
      .map((m) => `${m.period}=${formatValue(m.value, m.unit)}`)
      .join("; ");
    lines.push(`- ${key}: ${series}${source ? ` [source: ${source}]` : ""}`);
  }
  return lines.join("\n");
}

/**
 * 單家公司的完整渲染，供 get_company_profile 工具回傳。
 * 含身分資訊 + 近期財務指標（每筆帶 period 與 source）+ 10 段分析。
 * 找不到該 slug 回 null。
 */
export function renderCompanyForAI(slug: string): string | null {
  const c = getCompany(slug);
  if (!c) return null;

  const header = [
    `# ${c.nameEn}${c.nameZh ? ` (${c.nameZh})` : ""} — ${c.market}:${c.ticker}`,
    [
      c.sector ? `Sector: ${c.sector}` : null,
      c.foundedYear ? `Founded: ${c.foundedYear}` : null,
      c.listedYear ? `Listed: ${c.listedYear}` : null,
      c.headquarters ? `HQ: ${c.headquarters}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    [
      c.websiteUrl ? `Website: ${c.websiteUrl}` : null,
      `Status: ${c.status}`,
      `Data updated: ${c.updatedAt}`,
    ]
      .filter(Boolean)
      .join(" | "),
  ].join("\n");

  const sections = [...c.sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => `### ${s.headingEn}\n${s.bodyMarkdown.trim()}`)
    .join("\n\n");

  return [
    header,
    "",
    "## Recent financial metrics (cite the period + source when you quote any of these; never invent numbers)",
    renderMetrics(c.metrics),
    "",
    "## Analysis",
    sections,
  ].join("\n");
}
