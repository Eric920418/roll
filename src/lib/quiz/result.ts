import "server-only";
import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";

// 會員最新一次 quiz 結果的 DAL。
// 抽出 quiz/result 頁與 dashboard 頁各自 inline 的同一查詢，供 AI（NOVA 診斷）等處重用。
// 回傳「乾淨形狀」（決策三軸 + 匹配創辦人的英文名/角色/公司 slug），呼叫端不需碰 Prisma / 雙語 JSON。

export type QuizContext = {
  /** 使用者作答算出的決策風格三軸（約 0–100）。配對失敗可能為 null。 */
  scores: {
    planningDepth: number;
    executionStrength: number;
    visionClarity: number;
  } | null;
  /** 最接近的台灣創辦人原型（英文）。 */
  founder: {
    name: string;
    role: string | null;
    companySlug: string | null;
  } | null;
};

function toScores(value: unknown): QuizContext["scores"] {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" ? Math.round(x) : null);
  const planningDepth = num(v.planningDepth);
  const executionStrength = num(v.executionStrength);
  const visionClarity = num(v.visionClarity);
  if (planningDepth == null || executionStrength == null || visionClarity == null)
    return null;
  return { planningDepth, executionStrength, visionClarity };
}

/**
 * 取會員最新一次 quiz 結果。沒做過（或配對不到）回 null。
 * founder 名稱/角色取英文（供英文 system prompt 使用）。
 */
export async function getLatestQuizResult(
  userId: string,
): Promise<QuizContext | null> {
  const submission = await prisma.quizSubmission.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { founder: true },
  });
  if (!submission) return null;

  const f = submission.founder;
  return {
    scores: toScores(submission.scores),
    founder: f
      ? {
          name: pick(f.name, "en"),
          role: pick(f.role, "en") || null,
          companySlug: f.companySlug ?? null,
        }
      : null,
  };
}
