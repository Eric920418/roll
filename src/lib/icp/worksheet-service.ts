import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { evidenceStateSchema } from "@/lib/evidence/schema";
import { MemberError } from "@/lib/member-http";
import { prisma } from "@/lib/prisma";
import { worksheetAnswersSchema, worksheetAnswerText, worksheetAnswerValid, worksheetCardSchema, worksheetKeys, worksheetNextAction, type SavedWorksheet } from "./worksheet";

export const worksheetInputSchema = z.object({
  answers: worksheetAnswersSchema,
  card: worksheetCardSchema,
  revision: z.number().int().nonnegative(),
  locale: z.enum(["en", "zh-tw"]),
}).strict().superRefine(({ answers }, ctx) => {
  for (const key of worksheetKeys) {
    if (!worksheetAnswerValid(key, answers)) ctx.addIssue({
      code: "custom", path: ["answers", key], message: "請完成這題並選擇適用的選項 / Complete this question with valid choices",
    });
  }
});

const starterId = "onboarding-icp-worksheet";
function hypothesis(value: SavedWorksheet) {
  const { answers, card, locale } = value;
  return {
    id: starterId,
    description: card.hypothesis,
    who: card.who,
    size: "",
    buyer: worksheetAnswerText("buyer", answers, locale),
    pain: worksheetAnswerText("problem", answers, locale),
    alternatives: worksheetAnswerText("alternative", answers, locale),
    why: worksheetAnswerText("cost", answers, locale),
    test: [worksheetNextAction(answers, locale), card.question].join("\n"),
  };
}

async function loadState(userId: string) {
  const row = await prisma.evidenceWorkspace.findUnique({ where: { userId }, select: { data: true } });
  return evidenceStateSchema.safeParse(row?.data ?? {}).data;
}
export async function getSavedWorksheet(userId: string) {
  return (await loadState(userId))?.worksheet ?? null;
}
export async function getWorksheetPlanContext(userId: string) {
  const state = await loadState(userId);
  return state?.worksheet && state.selectedId === starterId ? state.hypotheses.find(item => item.id === starterId) : undefined;
}

const conflict = () => new MemberError("這份表單已在另一個分頁更新，請重新載入。你的輸入仍留在此分頁。 / This worksheet changed in another tab. Reload to see the saved version. Your input is still in this tab.", 409);

export async function saveWorksheet(userId: string, input: z.infer<typeof worksheetInputSchema>) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { completed: true, onboardingStep: true, quizCompleted: true, profile: { select: { icp: true, icpDetails: true } } } });
    if (!user) throw new MemberError("請重新登入 / Sign in again", 401);
    if (!user.completed && user.onboardingStep < 4) throw new MemberError("請先完成公司與需求資料 / Complete the company and requirements steps first", 409);

    const row = await tx.evidenceWorkspace.findUnique({ where: { userId } });
    const state = evidenceStateSchema.parse(row?.data ?? {});
    const previous = state.worksheet;
    const revision = previous?.revision ?? 0;
    const same = previous && previous.locale === input.locale && isDeepStrictEqual(previous.answers, input.answers) && isDeepStrictEqual(previous.card, input.card);
    if (same) return previous;
    if (revision !== input.revision) throw conflict();
    const saved = { ...input, revision: revision + 1 };
    state.worksheet = saved;

    // Only initialise an unused customer hypothesis. Do not replace one relied on by an existing plan or evidence.
    const untouched = state.maxStage <= 2 && state.links.length === 0 && !user.profile?.icp && !user.profile?.icpDetails;
    const knownAudience = Boolean(worksheetAnswerText("customer", input.answers, input.locale) || worksheetAnswerText("type", input.answers, input.locale));
    const original = !state.selectedId && !state.hypotheses.length && !state.selections.length;
    const starter = state.hypotheses.find(item => item.id === starterId);
    const editStarter = previous && state.selectedId === starterId && isDeepStrictEqual(starter, hypothesis(previous));
    if (untouched && knownAudience && (original || editStarter) && !await tx.actionPlan.findFirst({ where: { userId, activeKey: userId }, select: { id: true } })) {
      state.hypotheses = [...state.hypotheses.filter(item => item.id !== starterId), hypothesis(saved)];
      if (original) {
        state.selectedId = starterId;
        state.selections = [{ id: starterId, at: new Date().toISOString(), previousId: null }];
        state.maxStage = 2;
      }
    }
    const data = evidenceStateSchema.parse(state) as Prisma.InputJsonValue;
    if (row) {
      const updated = await tx.evidenceWorkspace.updateMany({ where: { userId, revision: row.revision }, data: { data, revision: { increment: 1 } } });
      if (!updated.count) throw conflict();
    } else {
      await tx.evidenceWorkspace.create({ data: { userId, data, revision: 1 } });
    }
    if (!user.completed || !user.quizCompleted) await tx.user.update({ where: { id: userId }, data: { completed: true, quizCompleted: true } });
    return saved;
  });
}
