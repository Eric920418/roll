import "server-only";
import { getQuestionBank, type Dual } from "@/lib/playbook/content";

// 雙週知識問答：無 cron、無 email —— 以會員「註冊日」為錨即時算「第幾個雙週」，
// 再從全題庫決定性挑一批（循環涵蓋全部）。server 端重算分數，不信前端。

const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;
export const QUESTIONS_PER_PERIOD = 5;

/** 全域唯一題 id（跨 playbook）：`<slug>::<段內題id>`。 */
export type QuizItem = {
  id: string;
  question: Dual;
  options: Dual[];
  answerIndex: number; // 不送前端
  explanation: Dual;
};

/** 以錨日（會員註冊日）算「第幾個雙週」。now <= anchor 回 0。 */
export function fortnightIndex(anchor: Date, now: Date): number {
  const diff = now.getTime() - anchor.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / FORTNIGHT_MS);
}

/** 本期結束（下一批開始）時間 = anchor + (periodIndex+1)*14d。 */
export function periodEnd(anchor: Date, periodIndex: number): Date {
  return new Date(anchor.getTime() + (periodIndex + 1) * FORTNIGHT_MS);
}

/** 距下一批還有幾天（無條件進位，至少 0）。 */
export function daysUntilNext(anchor: Date, periodIndex: number, now: Date): number {
  const ms = periodEnd(anchor, periodIndex).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** 決定性挑本期題目：以 periodIndex 為位移取滾動視窗，循環涵蓋全部題庫。 */
export function selectForPeriod(periodIndex: number, size = QUESTIONS_PER_PERIOD): QuizItem[] {
  const bank = getQuestionBank();
  if (bank.length === 0) return [];
  const n = Math.min(size, bank.length);
  const start = ((periodIndex * n) % bank.length + bank.length) % bank.length;
  const out: QuizItem[] = [];
  for (let i = 0; i < n; i++) {
    const q = bank[(start + i) % bank.length];
    out.push({
      id: `${q.playbookSlug}::${q.id}`,
      question: q.question,
      options: q.options,
      answerIndex: q.answerIndex,
      explanation: q.explanation,
    });
  }
  return out;
}

export type AttemptAnswer = { questionId: string; choice: number };
export type QuizResult = {
  score: number;
  total: number;
  results: { questionId: string; correct: boolean; chosen: number; answerIndex: number }[];
};

/** server 端重算分數（不信前端）。choice = 選項 index（-1 = 未答）。 */
export function scoreAttempt(selected: QuizItem[], answers: AttemptAnswer[]): QuizResult {
  const chosenById = new Map(answers.map((a) => [a.questionId, Number(a.choice)]));
  const results = selected.map((q) => {
    const chosen = chosenById.has(q.id) ? (chosenById.get(q.id) as number) : -1;
    return {
      questionId: q.id,
      correct: chosen === q.answerIndex,
      chosen,
      answerIndex: q.answerIndex,
    };
  });
  return { score: results.filter((r) => r.correct).length, total: selected.length, results };
}
