// 公司情報資料層：一家公司 = 一個 content/companies/<slug>.json（由 ingest 本機產出）。
// build 時用 fs 讀取 → 靜態生成。不經資料庫/CMS。
import fs from "node:fs";
import path from "node:path";

export type Metric = {
  period: string;
  metricKey: string;
  value: number;
  unit: string | null;
  source?: string;
};

export type Section = {
  order: number;
  slug: string;
  headingEn: string;
  bodyMarkdown: string;
};

export type SourceRef = { label: string; url: string; kind: string };

export type Company = {
  slug: string;
  ticker: string;
  market: string;
  nameEn: string;
  nameZh?: string | null;
  logoUrl?: string | null;
  sector?: string | null;
  foundedYear?: number | null;
  listedYear?: number | null;
  headquarters?: string | null;
  websiteUrl?: string | null;
  status: string;
  summaryEn?: string | null;
  factsHash?: string | null;
  updatedAt: string;
  model?: string | null;
  metrics: Metric[];
  sections: Section[];
  sources: SourceRef[];
};

const DIR = path.join(process.cwd(), "content", "companies");

export function getAllCompanies(): Company[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8")) as Company)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function getCompany(slug: string): Company | null {
  const p = path.join(DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Company;
}

// ── 輕量清單型別與 getter（後台用：只取列表需要的欄位，不含 metrics/sections）──

export type CompanyListItem = {
  slug: string;
  ticker: string;
  market: string;
  nameEn: string;
  nameZh: string | null;
  sector: string | null;
  summaryEn: string | null;
};

function toListItem(c: Company): CompanyListItem {
  return {
    slug: c.slug,
    ticker: c.ticker,
    market: c.market,
    nameEn: c.nameEn,
    nameZh: c.nameZh ?? null,
    sector: c.sector ?? null,
    summaryEn: c.summaryEn ?? null,
  };
}

/** 全部公司的輕量清單（依 ticker 排序），供後台 companies 列表頁使用。 */
export function getCompanyList(): CompanyListItem[] {
  return getAllCompanies().map(toListItem);
}

/** 便宜地數 json 檔數量（不解析內容），供 Overview 指標卡使用。 */
export function countCompanies(): number {
  if (!fs.existsSync(DIR)) return 0;
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).length;
}

/** 依指定 slug 取輕量卡片（略過不存在者），供 Overview「重點機會」精選使用。 */
export function getCompanyCards(slugs: string[]): CompanyListItem[] {
  return slugs
    .map(getCompany)
    .filter((c): c is Company => c !== null)
    .map(toListItem);
}
