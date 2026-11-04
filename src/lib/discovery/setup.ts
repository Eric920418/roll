import "server-only";
import { personalizationSchema, type Personalization } from "@/lib/action-plan/personalization";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Account } from "@/lib/auth/account";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { diagnoseActionPlan } from "@/lib/action-plan/ai";
import { DIAGNOSTIC_QUESTIONS } from "@/lib/action-plan/builder-draft";
import { diagnosisSchema, diagnoseBodySchema } from "@/lib/action-plan/schemas";
import { PlanWriteError } from "@/lib/action-plan/service";
import { getLatestQuizResult } from "@/lib/quiz/result";
import { DISCOVERY_POLICY, discoveryTrialActive, readDiscoverySetup, type DiscoverySetup } from "./policy";
import { discoveryAccount, getDiscoverySnapshot } from "./service";

type Input = { requestId: string; locale: "en" | "zh-tw"; answers: DiscoverySetup["answers"]; personalization?: Personalization };
const json = (value: unknown) => value as Prisma.InputJsonValue;
async function requireTrial(userId: string, tx: Prisma.TransactionClient) {
  const account = await discoveryAccount(userId, tx);
  if (!account || account.trialPolicy !== DISCOVERY_POLICY || !discoveryTrialActive(account)) throw new PlanWriteError("試用已結束或不適用此流程，已儲存回答保留 / Trial ended or is not eligible; saved answers are retained", 403);
}
export async function prepareDiscoverySetup(account: Account, input: Input) {
  const answers = diagnoseBodySchema.shape.answers.parse(input.answers);
  if (input.personalization) personalizationSchema.parse(input.personalization);
  else diagnoseBodySchema.shape.answers.unwrap().length(3).parse(answers);
  if (!input.personalization && answers.some((row, i) => row.question !== DIAGNOSTIC_QUESTIONS[input.locale][i])) throw new PlanWriteError("請依序完成目前三題 / Complete the three current questions in order", 400);
  const token = randomUUID();
  const claimed = await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await requireTrial(account.id, tx);
    await tx.discoveryJourney.upsert({ where: { userId: account.id }, create: { userId: account.id, setup: json({ ...input, answers, diagnosis: null, confirmed: false }) }, update: {} });
    await tx.$queryRaw`SELECT "id" FROM "DiscoveryJourney" WHERE "userId" = ${account.id} FOR UPDATE`;
    const journey = await tx.discoveryJourney.findUniqueOrThrow({ where: { userId: account.id } });
    const setup = readDiscoverySetup(journey.setup);
    const same = setup?.requestId === input.requestId && setup.locale === input.locale && JSON.stringify(setup.answers) === JSON.stringify(answers) && JSON.stringify(setup.personalization) === JSON.stringify(input.personalization);
    if (same && setup.diagnosis) return { id: journey.id, cached: setup.diagnosis };
    if (setup?.confirmed) throw new PlanWriteError("起步計畫已確認，請繼續已儲存的計畫 / Your starter plan is confirmed; continue your saved plan", 409);
    if (journey.analysisToken && journey.analysisExpiresAt && journey.analysisExpiresAt > new Date()) throw new PlanWriteError("個人化分析仍在處理，回答已保存；請稍後重新載入 / Analysis is processing; your answers are saved. Reload shortly", 409);
    const rate = await checkRateLimit(`discovery:setup:${process.env.ANTHROPIC_WORKSPACE_ID?.trim() || "default"}:${account.id}`, 3, DAY_MS, false, tx);
    if (!rate.ok) throw new PlanWriteError("今日起步分析重試已達上限，回答已保留 / Daily starter analysis retry limit reached; answers are retained", 429);
    await tx.discoveryJourney.update({ where: { id: journey.id }, data: { setup: json({ ...input, answers, diagnosis: null, confirmed: false }), analysisToken: token, analysisExpiresAt: new Date(Date.now() + 180000) } });
    return { id: journey.id, cached: null };
  });
  if (claimed.cached) return { status: "ready" as const, diagnosis: claimed.cached };
  try {
    const result = await diagnoseActionPlan({ locale: input.locale, answers, personalization: input.personalization, messages: [], profile: account.profile, quiz: await getLatestQuizResult(account.id) });
    if (result.status !== "ready") throw new PlanWriteError("三題已完成，請重試個人化分析 / All three answers are saved; retry the analysis", 422);
    const diagnosis = diagnosisSchema.parse(result.diagnosis);
    await prisma.$transaction(async raw => {
      const tx = raw as unknown as Prisma.TransactionClient; await requireTrial(account.id, tx);
      const saved = await tx.discoveryJourney.updateMany({ where: { id: claimed.id, userId: account.id, analysisToken: token }, data: { setup: json({ ...input, answers, diagnosis, confirmed: false }), analysisToken: null, analysisExpiresAt: null } });
      if (!saved.count) throw new PlanWriteError("起步計畫已在另一頁更新，回答保留；請重新載入 / Starter plan changed in another tab; reload with your answers retained", 409);
    });
    return { status: "ready" as const, diagnosis };
  } catch (error) {
    await prisma.discoveryJourney.updateMany({ where: { id: claimed.id, userId: account.id, analysisToken: token }, data: { analysisToken: null, analysisExpiresAt: null } });
    throw error;
  }
}
export async function confirmDiscoverySetup(userId: string, input: Input & { diagnosis: unknown }) {
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient; await requireTrial(userId, tx);
    await tx.$queryRaw`SELECT "id" FROM "DiscoveryJourney" WHERE "userId" = ${userId} FOR UPDATE`;
    const journey = await tx.discoveryJourney.findUnique({ where: { userId } }), setup = readDiscoverySetup(journey?.setup);
    const diagnosis = diagnosisSchema.parse(input.diagnosis);
    if (!journey || !setup?.diagnosis || setup.requestId !== input.requestId || setup.locale !== input.locale || JSON.stringify(setup.answers) !== JSON.stringify(input.answers) || JSON.stringify(setup.personalization) !== JSON.stringify(input.personalization) || JSON.stringify(setup.diagnosis) !== JSON.stringify(diagnosis)) throw new PlanWriteError("請先完成並檢視伺服器分析；回答已保留 / Complete and review the server analysis first; your answers are retained", 409);
    if (!setup.confirmed) await tx.discoveryJourney.update({ where: { id: journey.id }, data: { setup: json({ ...setup, confirmed: true }), version: { increment: 1 } } });
  });
  return getDiscoverySnapshot(userId);
}
export async function discoverySetupResult(userId: string, requestId: string) {
  const journey = await prisma.discoveryJourney.findUnique({ where: { userId } }), setup = readDiscoverySetup(journey?.setup);
  return setup?.confirmed && setup.requestId === requestId ? journey!.id : null;
}
