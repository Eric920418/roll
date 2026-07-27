import fs from "node:fs";
import path from "node:path";

// Playbook（知識手冊）資料層：一份 = 一個 content/playbooks/<slug>.json（由 scripts/ingest-playbook.mjs 產出）。
// 分段結構：每個「紅色標題」= 一個 segment（可追蹤已讀 + 出題）。與公司情報同模式：fs 讀取、不經 DB。
// 雙用：餵 Nova AI（get_playbook）+ 生成會員指南頁 + 雙週問答題庫來源。

export type Dual = { en: string; "zh-tw": string };

export type PlaybookQuestion = {
  id: string;
  question: Dual;
  options: Dual[]; // 通常 4 個
  answerIndex: number;
  explanation: Dual;
};

export type PlaybookSegment = {
  key: string; // 穩定 kebab id，供已讀追蹤 + 出題連結
  order: number;
  heading: Dual;
  body: Dual; // 該段 markdown
  questions: PlaybookQuestion[];
};

export type Playbook = {
  slug: string;
  category: string;
  title: Dual;
  summary: Dual;
  segments: PlaybookSegment[];
  source?: { file: string; ingestedAt: string; model: string };
};

export type PlaybookListItem = {
  slug: string;
  category: string;
  title: Dual;
  summary: Dual;
  segmentCount: number;
};

const DIR = path.join(process.cwd(), "content", "playbooks");

/** 全部 playbook（含 segments），依 slug 排序。只讀 .json（略過 _inbox 等）。 */
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
    .filter((p): p is Playbook => !!p?.slug && Array.isArray(p?.segments))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** 輕量清單（不含段落內文），供列表頁與 AI 索引。 */
export function getPlaybookList(): PlaybookListItem[] {
  return getAllPlaybooks().map(({ slug, category, title, summary, segments }) => ({
    slug,
    category,
    title,
    summary,
    segmentCount: segments.length,
  }));
}

/** 依 slug 取完整 playbook（含 segments + 題庫）；不存在回 null。 */
export function getPlaybook(slug: string): Playbook | null {
  const p = path.join(DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Playbook;
  } catch {
    return null;
  }
}

/** 便宜地數 json 檔數量。 */
export function countPlaybooks(): number {
  if (!fs.existsSync(DIR)) return 0;
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).length;
}

export type BankQuestion = PlaybookQuestion & {
  playbookSlug: string;
  segmentKey: string;
};

/**
 * 攤平全部 playbook 的題庫（供雙週問答挑題）。
 * 順序為決定性：playbook（slug 序）→ segment（order 序）→ question（陣列序），供 selectForPeriod 循環取批。
 */
export function getQuestionBank(): BankQuestion[] {
  const bank: BankQuestion[] = [];
  for (const pb of getAllPlaybooks()) {
    for (const seg of [...pb.segments].sort((a, b) => a.order - b.order)) {
      for (const q of seg.questions ?? []) {
        bank.push({ ...q, playbookSlug: pb.slug, segmentKey: seg.key });
      }
    }
  }
  return bank;
}

/** 依 locale 取雙語欄位（fallback en）。 */
export function pickDual(d: Dual | undefined, locale: string): string {
  if (!d) return "";
  return (locale === "zh-tw" ? d["zh-tw"] : d.en) || d.en || "";
}
