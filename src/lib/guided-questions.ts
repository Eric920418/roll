export type GuidedProgress = { questionId: string | null; skipped: string[] };
export type GuidedQuestionValue = { id: string; value: string; ask?: boolean };

export function nextGuidedQuestion(questions: GuidedQuestionValue[], skipped: string[] = []): string | null {
  return questions.find(q => q.ask !== false && !q.value.trim() && !skipped.includes(q.id))?.id ?? null;
}

export function readGuidedProgress(value: unknown): GuidedProgress | undefined {
  if (!value || typeof value !== "object") return;
  const progress = value as Partial<GuidedProgress>;
  if ((progress.questionId !== null && typeof progress.questionId !== "string") || !Array.isArray(progress.skipped) || !progress.skipped.every(id => typeof id === "string")) return;
  return { questionId: progress.questionId, skipped: progress.skipped };
}
