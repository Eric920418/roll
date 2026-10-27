import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { changed, MemberError } from "@/lib/member-http";
import { cardDraftSchema, interviewCompanies, publicCard, type CardDraft, type CardSources, type CardStats, type CardWrite } from "./schema";

export const requestHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const sourceSelect = { oneLinePitch: true, icp: true, targetMarkets: true } as const;
async function statsFor(userIds: string[]) {
  const [notes, outcomes, milestones] = await Promise.all([
    prisma.meetingNote.findMany({ where: { userId: { in: userIds } }, select: { userId: true, insight: true } }),
    prisma.customerStageOutcome.findMany({ where: { userId: { in: userIds }, stage: "first_sales" }, select: { userId: true, primaryCount: true } }),
    prisma.planMilestone.findMany({ where: { achievedAt: { not: null }, actionPlan: { userId: { in: userIds }, activeKey: { not: null }, archivedAt: null } }, select: { actionPlan: { select: { userId: true } } } }),
  ]);
  return new Map(userIds.map(id => [id, { interviews: interviewCompanies(notes.filter(n => n.userId === id).map(n => n.insight)), payingCustomers: outcomes.find(o => o.userId === id)?.primaryCount ?? null, milestones: milestones.filter(m => m.actionPlan.userId === id).length }]));
}
export type CardOwner = { id: string | null; draft: CardDraft; revision: number; visible: boolean; optedInAt: string | null; source: CardSources; stats: CardStats; hasPhoto: boolean; verified: boolean; recommended: boolean; lastActiveAt: string | null };
export async function getMyCard(userId: string): Promise<CardOwner> {
  const [row, profile, stats] = await Promise.all([
    prisma.matchmakingProfile.findUnique({ where: { userId } }),
    prisma.onboardingProfile.findUnique({ where: { userId } }), statsFor([userId]),
  ]);
  return {
    id: row?.id ?? null, draft: row ? cardDraftSchema.parse({ role: row.role, categories: row.categories, country: row.country, industry: row.industry, slogan: row.slogan, offers: row.offers, looksFor: row.looksFor, visibleFields: row.visibleFields }) : {
      role: "founder", categories: ["collaboration"], country: profile?.country || "", industry: profile?.industry || "", slogan: profile?.oneLinePitch || "", offers: "", looksFor: profile?.primaryNeed || "", visibleFields: ["country", "industry", "slogan", "offers", "looksFor"],
    },
    revision: row?.revision ?? 0, visible: row?.visible ?? false, optedInAt: row?.optedInAt?.toISOString() ?? null,
    source: profile ? { oneLinePitch: profile.oneLinePitch, icp: profile.icp, targetMarkets: profile.targetMarkets } : null,
    stats: stats.get(userId)!, hasPhoto: Boolean(row?.originalPhoto && row?.blurredPhoto), verified: row?.verified ?? false, recommended: row?.recommended ?? false, lastActiveAt: row?.lastActiveAt?.toISOString() ?? null,
  };
}
export async function writeMyCard(userId: string, input: CardWrite) {
  const hash = requestHash(input);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const row = await tx.matchmakingProfile.findUnique({ where: { userId } });
    if (row?.lastRequestId === input.requestId) { if (row.lastRequestHash !== hash) throw changed(); return; }
    if ((row?.revision ?? 0) !== input.revision) throw changed();
    if (input.action === "hide") {
      if (!row) throw new MemberError("請先儲存卡片 / Save your card first", 400);
      await tx.matchmakingProfile.update({ where: { userId }, data: { visible: false, revision: { increment: 1 }, lastRequestId: input.requestId, lastRequestHash: hash } });
      return;
    }
    // A visible founder cannot bypass the evidence gate through edits or a role change.
    const visible = input.action === "publish" || Boolean(row?.visible);
    if (visible && input.draft.role === "founder") {
      const notes = await tx.meetingNote.findMany({ where: { userId }, select: { insight: true } });
      if (interviewCompanies(notes.map(n => n.insight)) < 3) throw new MemberError("創辦人須先完成三家不同公司的有效客戶訪談 / Founders need valid customer interviews with three different companies", 403);
    }
    const data = { ...input.draft, visible, ...(input.action === "publish" ? { optedInAt: new Date() } : {}), ...(row?.role !== input.draft.role ? { verified: false, reviewedAt: null } : {}), lastRequestId: input.requestId, lastRequestHash: hash };
    if (row) await tx.matchmakingProfile.update({ where: { userId }, data: { ...data, revision: { increment: 1 } } });
    else await tx.matchmakingProfile.create({ data: { ...data, userId, revision: 1 } });
  });
  return getMyCard(userId);
}
export async function listCards(userId: string, category: string | null, page: number) {
  const [rows, viewer] = await Promise.all([
    prisma.matchmakingProfile.findMany({ where: { visible: true, ...(category && category !== "all" ? { categories: { has: category } } : {}) }, orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { id: "asc" }], skip: (page - 1) * 24, take: 25, include: { user: { select: { profile: { select: sourceSelect } } } } }),
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { industry: true, targetMarkets: true } }),
  ]);
  const selected = rows.slice(0, 24), stats = await statsFor(selected.map(row => row.userId));
  return { cards: selected.map(row => publicCard({ ...cardDraftSchema.parse({ role: row.role, categories: row.categories, country: row.country, industry: row.industry, slogan: row.slogan, offers: row.offers, looksFor: row.looksFor, visibleFields: row.visibleFields }), id: row.id, revision: row.revision, blurredPhoto: row.blurredPhoto, lastActiveAt: row.lastActiveAt, verified: row.verified, recommended: row.recommended }, row.user.profile, stats.get(row.userId)!, viewer)), hasMore: rows.length > 24 };
}
export async function getMemberCard(userId: string, id: string) {
  const row = await prisma.matchmakingProfile.findFirst({ where: { id, visible: true }, include: { user: { select: { profile: { select: sourceSelect } } } } });
  if (!row) throw new MemberError("找不到可見卡片 / Visible card not found", 404);
  const [stats, viewer] = await Promise.all([statsFor([row.userId]), prisma.onboardingProfile.findUnique({ where: { userId }, select: { industry: true, targetMarkets: true } })]);
  return publicCard({ ...cardDraftSchema.parse({ role: row.role, categories: row.categories, country: row.country, industry: row.industry, slogan: row.slogan, offers: row.offers, looksFor: row.looksFor, visibleFields: row.visibleFields }), id: row.id, revision: row.revision, blurredPhoto: row.blurredPhoto, lastActiveAt: row.lastActiveAt, verified: row.verified, recommended: row.recommended }, row.user.profile, stats.get(row.userId)!, viewer);
}
export async function recordActivity(userId: string, now = new Date()) {
  await prisma.matchmakingProfile.updateMany({ where: { userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lte: new Date(now.getTime() - 86400000) } }] }, data: { lastActiveAt: now } });
  return { saved: true };
}
