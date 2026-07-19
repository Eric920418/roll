import fs from "node:fs";
import path from "node:path";

// Playbook（知識手冊）資料層：一份 = 一個 content/playbooks/<slug>.json（由 scripts/ingest-playbook.mjs 產出）。
// 與公司情報同模式：build/runtime 用 fs 讀取，不經資料庫/CMS。雙用：餵 Nova AI + 生成會員指南頁。

export type Dual = { en: string; "zh-tw": string };

export type Playbook = {
  slug: string;
  category: string;
  title: Dual;
  summary: Dual;
  body: Dual; // 完整內容 markdown（章節用 ## 標題）
  source?: { file: string; ingestedAt: string; model: string };
};

export type PlaybookListItem = {
  slug: string;
  category: string;
  title: Dual;
  summary: Dual;
};

const DIR = path.join(process.cwd(), "content", "playbooks");

/** 全部 playbook（含 body），依 slug 排序。只讀 .json（略過 _inbox 等）。 */
export function getAllPlaybooks(): Playbook[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8")) as Playbook;
      } catch {
        return null;
      }
    })
    .filter((p): p is Playbook => !!p?.slug && !!p?.body)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** 輕量清單（不含 body），供列表頁與 AI 索引。 */
export function getPlaybookList(): PlaybookListItem[] {
  return getAllPlaybooks().map(({ slug, category, title, summary }) => ({
    slug,
    category,
    title,
    summary,
  }));
}

/** 依 slug 取完整 playbook（含 body）；不存在回 null。 */
export function getPlaybook(slug: string): Playbook | null {
  const p = path.join(DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Playbook;
  } catch {
    return null;
  }
}

/** 便宜地數 json 檔數量（不解析內容）。 */
export function countPlaybooks(): number {
  if (!fs.existsSync(DIR)) return 0;
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).length;
}

/** 依 locale 取雙語欄位（fallback en）。 */
export function pickDual(d: Dual | undefined, locale: string): string {
  if (!d) return "";
  return (locale === "zh-tw" ? d["zh-tw"] : d.en) || d.en || "";
}
