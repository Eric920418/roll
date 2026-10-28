import { refreshInterviewProgress } from "@/lib/customer-insights/service";
import { lockActivePlan } from "@/lib/action-plan/service";
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectivePlan } from "@/lib/billing/gate";
import { toPlanKey } from "@/lib/billing/plans";
import { PlanWriteError } from "@/lib/action-plan/service";
import { DISCOVERY_POLICY, TRIAL_INTERVIEWS, FULL_INTERVIEWS, discoveryTrialActive, discoveryEvidence } from "./policy";

export const discoveryAccountSelect = { id: true, plan: true, rollonMember: true, subscriptionStatus: true, paypalSubscriptionId: true, currentPeriodEnd: true, planUpdatedAt: true, trialPlan: true, trialStartsAt: true, trialEndsAt: true, trialPolicy: true, founderStartedAt: true, founderEndsAt: true } as const;
export type DiscoveryAccount = NonNullable<Awaited<ReturnType<typeof discoveryAccount>>>;
export function discoveryAccount(userId: string, db: Pick<Prisma.TransactionClient, "user"> = prisma as unknown as Prisma.TransactionClient) { return db.user.findUnique({ where: { id: userId }, select: discoveryAccountSelect }); }
export function discoveryPaid(account: DiscoveryAccount) { return getEffectivePlan({ ...account, plan: toPlanKey(account.plan), trialPlan: account.trialPlan ? toPlanKey(account.trialPlan) : null }) !== "free"; }
export function discoveryRows(userId: string, journeyId: string, db: Pick<Prisma.TransactionClient, "meetingNote"> = prisma as unknown as Prisma.TransactionClient) {
  return db.meetingNote.findMany({ where: { userId, insight: { path: ["journeyId"], equals: journeyId } }, select: { id: true, updatedAt: true, insight: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
}
export async function lockDiscoveryWrite(tx: Prisma.TransactionClient, userId: string, journeyId: string, creating = false) {
  const linked = await tx.actionPlan.findFirst({ where: { userId, activeKey: userId, sourceJourneyId: journeyId }, select: { id: true } });
  if (linked) await lockActivePlan(tx, userId, linked.id);
  const owned = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "DiscoveryJourney" WHERE "id" = ${journeyId} AND "userId" = ${userId} FOR UPDATE`;
  if (!owned.length) throw new PlanWriteError("找不到訪談工作區 / Interview workspace not found", 404);
  const account = await discoveryAccount(userId, tx);
  if (!account || account.trialPolicy !== DISCOVERY_POLICY) throw new PlanWriteError("無法存取此訪談工作區 / Workspace access denied", 403);
  const paid = discoveryPaid(account);
  if (!paid && !discoveryTrialActive(account)) throw new PlanWriteError("14 天試用已結束；已儲存內容保留，升級後可繼續 / Trial ended; saved records are retained. Upgrade to continue", 402);
  if (creating) {
    const total = discoveryEvidence(journeyId, await discoveryRows(userId, journeyId, tx)).length;
    if (total >= (paid ? FULL_INTERVIEWS : TRIAL_INTERVIEWS)) throw new PlanWriteError(paid ? "十次訪談已達標，請查看完整報告或建立下一步計畫 / Interview target reached; view the report or build your next plan" : "三次試用訪談已完成，升級後可繼續七次訪談 / Trial milestone reached. Upgrade to continue with seven more interviews", paid ? 409 : 402);
  }
}
export async function invalidateDiscovery(tx: Prisma.TransactionClient, journeyId: string) {
  const journey = await tx.discoveryJourney.findUniqueOrThrow({ where: { id: journeyId } });
  const account = await discoveryAccount(journey.userId, tx);
  const limit = account && discoveryPaid(account) ? FULL_INTERVIEWS : TRIAL_INTERVIEWS;
  // Validate the projected total as well: editing a formerly duplicated company must not bypass the cap.
  if (discoveryEvidence(journeyId, await discoveryRows(journey.userId, journeyId, tx)).length > limit) throw new PlanWriteError("已達訪談上限，這次修改未儲存 / Interview limit reached; this change was not saved", limit === TRIAL_INTERVIEWS ? 402 : 409);
  const linkedActions = await tx.actionItem.findMany({ where: { recordingMode: "interview", actionPlan: { userId: journey.userId, activeKey: journey.userId, sourceJourneyId: journeyId } }, select: { id: true } });
  for (const action of linkedActions) await refreshInterviewProgress(tx, journey.userId, action.id);
  await tx.discoveryJourney.update({ where: { id: journeyId }, data: { version: { increment: 1 }, preview: Prisma.DbNull, previewVersion: null, report: Prisma.DbNull, reportVersion: null } });
  if (process.env.MEMBER_NETWORK_ENABLED === "true") await (await import("@/lib/network/watches")).evaluateWatches(tx, journey.userId);
}
export async function getDiscoverySnapshot(userId: string) {
  const account = await discoveryAccount(userId);
  if (!account || account.trialPolicy !== DISCOVERY_POLICY) throw new PlanWriteError("此帳號沿用原有方案與試用 / This account retains its existing plan and trial", 403);
  const journey = await prisma.discoveryJourney.findUnique({ where: { userId } });
  const rows = journey ? await discoveryRows(userId, journey.id) : [];
  const evidence = journey ? discoveryEvidence(journey.id, rows) : [];
  const paid = discoveryPaid(account), active = discoveryTrialActive(account);
  return { journeyId: journey?.id ?? null, version: journey?.version ?? 0, paid, active, endsAt: account.trialEndsAt?.toISOString() ?? null,
    daysRemaining: account.trialEndsAt ? Math.max(0, Math.ceil((account.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : 0,
    target: paid ? FULL_INTERVIEWS : TRIAL_INTERVIEWS, total: evidence.length,
    canCreate: (paid || active) && evidence.length < (paid ? FULL_INTERVIEWS : TRIAL_INTERVIEWS),
    rows: rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    preview: journey?.previewVersion === journey?.version ? journey?.preview ?? null : null,
    report: paid && evidence.length >= FULL_INTERVIEWS && journey?.reportVersion === journey?.version ? journey?.report ?? null : null,
    founderEndsAt: account.founderEndsAt?.toISOString() ?? null,
  };
}
