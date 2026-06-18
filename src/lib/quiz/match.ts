// 測驗配對：作答 → 決策風格三維分數 → 配對向量距離最近的創辦人。
// 純函式（不依賴 Prisma 型別），供 /api/quiz/submit 與測試共用。

export type Dimension = "planning" | "execution" | "vision";

export type Scores = {
  planningDepth: number;
  executionStrength: number;
  visionClarity: number;
};

export type Answer = { questionId: string; choice: "A" | "B" };

export type ScorableQuestion = {
  id: string;
  dimension: string; // "planning" | "execution" | "vision"
  optionA: { value: number };
  optionB: { value: number };
};

const DIM_TO_KEY: Record<string, keyof Scores> = {
  planning: "planningDepth",
  execution: "executionStrength",
  vision: "visionClarity",
};

/** 依作答彙整三維分數；同維度多題取平均，缺維度回中性 50。 */
export function scoreAnswers(
  questions: ScorableQuestion[],
  answers: Answer[],
): Scores {
  const acc: Record<keyof Scores, { sum: number; n: number }> = {
    planningDepth: { sum: 0, n: 0 },
    executionStrength: { sum: 0, n: 0 },
    visionClarity: { sum: 0, n: 0 },
  };
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const key = DIM_TO_KEY[q.dimension];
    if (!key) continue;
    const value = a.choice === "A" ? q.optionA.value : q.optionB.value;
    acc[key].sum += value;
    acc[key].n += 1;
  }
  const avg = (k: keyof Scores) =>
    acc[k].n ? Math.round(acc[k].sum / acc[k].n) : 50;
  return {
    planningDepth: avg("planningDepth"),
    executionStrength: avg("executionStrength"),
    visionClarity: avg("visionClarity"),
  };
}

export type MatchableFounder = {
  planningDepth: number;
  executionStrength: number;
  visionClarity: number;
};

/** 三維歐氏距離最近的創辦人；空清單回 null。 */
export function matchFounder<T extends MatchableFounder>(
  scores: Scores,
  founders: T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const f of founders) {
    const d =
      (f.planningDepth - scores.planningDepth) ** 2 +
      (f.executionStrength - scores.executionStrength) ** 2 +
      (f.visionClarity - scores.visionClarity) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}
