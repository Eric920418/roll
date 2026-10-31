import { COMPANY_STAGES } from "@/lib/action-plan/constants";
import { awardProfile, rewardTransaction } from "@/lib/rewards/service";
import { canonicalCountry, countryCode, industryCode } from "@/lib/member-options";
import { networkEnabled } from "@/lib/network/policy";
import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { changed, MemberError } from "@/lib/member-http";
import { cardDraftSchema, interviewCompanies, publicCard, listingSchema, matchesPublicCard, recommendationRank, type CardFilters, type CardDraft, type CardSources, type CardStats, type CardWrite } from "./schema";

export const requestHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const sourceSelect = { companyName: true, companyStage: true, country: true, industry: true, oneLinePitch: true, icp: true, targetMarkets: true } as const;
async function statsFor(userIds: string[]) {
  const [notes, outcomes, milestones] = await Promise.all([
    prisma.meetingNote.findMany({ where: { userId: { in: userIds } }, select: { userId: true, insight: true } }),
    prisma.customerStageOutcome.findMany({ where: { userId: { in: userIds }, stage: "first_sales" }, select: { userId: true, primaryCount: true } }),
    prisma.planMilestone.findMany({ where: { achievedAt: { not: null }, actionPlan: { userId: { in: userIds }, activeKey: { not: null }, archivedAt: null } }, select: { actionPlan: { select: { userId: true } } } }),
  ]);
  return new Map(userIds.map(id => [id, { interviews: interviewCompanies(notes.filter(n => n.userId === id).map(n => n.insight)), payingCustomers: outcomes.find(o => o.userId === id)?.primaryCount ?? null, milestones: milestones.filter(m => m.actionPlan.userId === id).length }]));
}
export type CardOwner = { id: string | null; draft: CardDraft; revision: number; visible: boolean; hiddenByUser?: boolean; sourcePolicy?: number | null; sourceVersion: string | null; optedInAt: string | null; source: CardSources; stats: CardStats; hasPhoto: boolean; verified: boolean; recommended: boolean; lastActiveAt: string | null };
export async function getMyCard(userId: string): Promise<CardOwner> {
  if (networkEnabled()) await (await import("@/lib/network/access")).ensureCard(userId);
  const [row, profile, stats] = await Promise.all([
    prisma.matchmakingProfile.findUnique({ where: { userId } }),
    prisma.onboardingProfile.findUnique({ where: { userId } }), statsFor([userId]),
  ]);
  return {
    id: row?.id ?? null, sourcePolicy: row?.sourcePolicy, draft: row ? cardDraftSchema.parse({ displayName: row.displayName || "", role: row.role, categories: row.categories, country: row.country, industry: row.industry, slogan: row.slogan, offers: row.offers, looksFor: row.looksFor, visibleFields: row.visibleFields }) : {
      role: "founder", categories: ["collaboration"], country: profile?.country || "", industry: profile?.industry || "", slogan: profile?.oneLinePitch || "", offers: "", looksFor: profile?.primaryNeed || "", visibleFields: ["country", "industry", "slogan", "offers", "looksFor"],
    },
    sourceVersion: profile?.updatedAt.toISOString() ?? null,
    revision: row?.revision ?? 0, visible: row?.visible ?? false, hiddenByUser: row?.sourcePolicy === 2 ? Boolean(row.hiddenByUserAt) : !row?.visible, optedInAt: row?.optedInAt?.toISOString() ?? null,
    source: profile ? { companyStage: profile.companyStage, companyName: profile.companyName, country: profile.country, industry: profile.industry, oneLinePitch: profile.oneLinePitch, icp: profile.icp, targetMarkets: profile.targetMarkets } : null,
    stats: stats.get(userId)!, hasPhoto: Boolean(row?.originalPhoto && row?.blurredPhoto), verified: row?.verified ?? false, recommended: row?.recommended ?? false, lastActiveAt: row?.lastActiveAt?.toISOString() ?? null,
  };
}
export async function writeMyCard(userId: string, input: CardWrite) {
  const hash = requestHash(input);
  await rewardTransaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const row = await tx.matchmakingProfile.findUnique({ where: { userId } });
    if (row?.lastRequestId === input.requestId) { if (row.lastRequestHash !== hash) throw changed(); return; }
    if ((row?.revision ?? 0) !== input.revision) throw changed();
    if (input.action === "hide") {
      if (!row) throw new MemberError("請先儲存卡片 / Save your card first", 400);
      await tx.matchmakingProfile.update({ where: { userId }, data: { visible: false, ...(networkEnabled() ? { hiddenByUserAt: new Date() } : {}), revision: { increment: 1 }, lastRequestId: input.requestId, lastRequestHash: hash } });
      return;
    }
    if (input.company) {
      await tx.$queryRaw`SELECT "id" FROM "OnboardingProfile" WHERE "userId" = ${userId} FOR UPDATE`;
      const profile = await tx.onboardingProfile.findUnique({ where: { userId } });
      if ((profile?.updatedAt.toISOString() ?? null) !== input.company.sourceVersion) throw changed();
      const c = input.company;
      if (c.companyStage && !COMPANY_STAGES.includes(c.companyStage as typeof COMPANY_STAGES[number]) && c.companyStage !== profile?.companyStage) throw new MemberError("請從選單選擇階段 / Select a stage from the list", 400);
      if (c.country && !countryCode(c.country) && c.country !== profile?.country) throw new MemberError("請從選單選擇國家 / Select a country from the list", 400);
      if (c.industry && !industryCode(c.industry) && c.industry !== profile?.industry) throw new MemberError("請從選單選擇產業 / Select an industry from the list", 400);
      const data = { companyName: c.companyName, oneLinePitch: c.oneLinePitch, country: canonicalCountry(c.country), industry: industryCode(c.industry) || c.industry, companyStage: c.companyStage || null };
      await tx.onboardingProfile.upsert({ where: { userId }, create: { userId, targetMarkets: [], needs: [], ...data }, update: data });
      await awardProfile(tx, userId);
    }
    if (row?.sourcePolicy !== 2 && ["country", "industry", "slogan", "offers"].some(key => !String(input.draft[key as keyof typeof input.draft] || "").length)) throw new MemberError("請填妥手動卡片必填欄位 / Complete the required manual-card fields", 400);
    // A visible founder cannot bypass the evidence gate through edits or a role change.
    let visible = input.action === "publish" || Boolean(row?.visible);
    if (visible && input.draft.role === "founder" && !networkEnabled()) {
      const notes = await tx.meetingNote.findMany({ where: { userId }, select: { insight: true } });
      if (interviewCompanies(notes.map(n => n.insight)) < 3) throw new MemberError("創辦人須先完成三家不同公司的有效客戶訪談 / Founders need valid customer interviews with three different companies", 403);
    }
    if (visible && networkEnabled() && row?.sourcePolicy === 2) { const profile = await tx.onboardingProfile.findUnique({ where: { userId } }); if (!profile?.companyName || !profile.industry || !profile.country) visible = false; }
    const draft = { ...input.draft };
    if (draft.country && !countryCode(draft.country) && draft.country !== row?.country) throw new MemberError("請從選單選擇國家 / Select a country from the list", 400);
    if (draft.industry && !industryCode(draft.industry) && draft.industry !== row?.industry) throw new MemberError("請從選單選擇產業 / Select an industry from the list", 400);
    draft.country = canonicalCountry(draft.country); draft.industry = industryCode(draft.industry) || draft.industry;
    const data = { ...draft, visible, ...(networkEnabled() && input.action === "publish" ? { hiddenByUserAt: null } : {}), ...(input.action === "publish" ? { optedInAt: new Date() } : {}), ...(row?.role !== input.draft.role ? { verified: false, reviewedAt: null } : {}), lastRequestId: input.requestId, lastRequestHash: hash };
    if (row) await tx.matchmakingProfile.update({ where: { userId }, data: { ...data, revision: { increment: 1 } } });
    else await tx.matchmakingProfile.create({ data: { ...data, userId, revision: 1 } });
  });
  return getMyCard(userId);
}
async function viewerSources(userId: string) {
  const [profile, card] = await Promise.all([prisma.onboardingProfile.findUnique({ where: { userId }, select: { industry: true, targetMarkets: true } }), prisma.matchmakingProfile.findUnique({ where: { userId }, select: { categories: true } })]);
  return { ...profile, categories: card?.categories || [] };
}
async function withChat(userId: string, cards: { userId: string; card: import("./schema").PublicCard }[]) {
  const rows = await prisma.networkConnection.findMany({ where: { OR: [{ senderId: userId, recipientId: { in: cards.map(v => v.userId) } }, { recipientId: userId, senderId: { in: cards.map(v => v.userId) } }] }, select: { id: true, senderId: true, recipientId: true, status: true } });
  return cards.map(({ userId: peer, card }) => { const r = rows.find(r => r.senderId === peer || r.recipientId === peer); return { ...card, chat: r ? { id: r.id, status: r.status, outgoing: r.senderId === userId } : null }; });
}
export async function listCards(userId: string, category: string | null, page: number, options: Partial<CardFilters> = {}) {
  if (networkEnabled()) await (await import("@/lib/network/access")).requireNetwork(userId);
  const filters = listingSchema.parse({ ...options, category: category || "all", page });
  const [viewer, blocked] = await Promise.all([viewerSources(userId), prisma.networkConnection.findMany({ where: { status: "blocked", OR: [{ senderId: userId }, { recipientId: userId }] }, select: { senderId: true, recipientId: true } })]);
  const excluded = [userId, ...blocked.flatMap(v => [v.senderId, v.recipientId])];
  const selected: { userId: string; card: import("./schema").PublicCard; at: number }[] = [], offset = (page - 1) * 24;
  let cursor: string | undefined;
  // shortcut: rank public projections in batches; index a public search projection when the network grows.
  for (;;) {
    const rows = await prisma.matchmakingProfile.findMany({ where: { userId: { notIn: excluded }, visible: true, ...(!networkEnabled() ? { sourcePolicy: null } : {}), ...(filters.category !== "all" ? { categories: { has: filters.category } } : {}), ...(filters.role !== "all" ? { role: filters.role } : {}) }, orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { id: "asc" }], take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { user: { select: { profile: { select: sourceSelect } } } } });
    const stats = networkEnabled() ? null : await statsFor(rows.map(r => r.userId));
    for (const row of rows) {
      const card = publicCard({ ...cardDraftSchema.parse({ displayName: row.displayName || "", role: row.role, categories: row.categories, country: row.country, industry: row.industry, slogan: row.slogan, offers: row.offers, looksFor: row.looksFor, visibleFields: row.visibleFields }), id: row.id, sourcePolicy: row.sourcePolicy, displayName: row.displayName, revision: row.revision, blurredPhoto: row.blurredPhoto, lastActiveAt: row.lastActiveAt, verified: row.verified, recommended: row.recommended }, row.user.profile, stats?.get(row.userId) || { interviews: 0, payingCustomers: null, milestones: 0 }, viewer, new Date(), networkEnabled());
      if (matchesPublicCard(card, filters) && (filters.view !== "recommendations" || recommendationRank(card) > 0)) selected.push({ userId: row.userId, card, at: row.lastActiveAt?.getTime() || 0 });
    }
    if (rows.length < 100) break;
    cursor = rows.at(-1)!.id;
  }
  selected.sort((a, b) => (filters.view === "recommendations" ? recommendationRank(b.card) - recommendationRank(a.card) : 0) || b.at - a.at || a.card.id.localeCompare(b.card.id));
  return { cards: await withChat(userId, selected.slice(offset, offset + 24)), hasMore: selected.length > offset + 24 };
}
export async function getMemberCard(userId: string, id: string) {
  const row = await prisma.matchmakingProfile.findFirst({ where: { id, visible: true, ...(!networkEnabled() ? { sourcePolicy: null } : {}) }, include: { user: { select: { profile: { select: sourceSelect } } } } });
  if (!row) throw new MemberError("找不到可見卡片 / Visible card not found", 404);
  if (networkEnabled() && row.userId !== userId && !await (await import("@/lib/network/access")).acceptedConnection(row.userId, userId)) await (await import("@/lib/network/access")).requireNetwork(userId);
  const blocked = await prisma.networkConnection.findFirst({ where: { status: "blocked", OR: [{ senderId: userId, recipientId: row.userId }, { senderId: row.userId, recipientId: userId }] } });
  if (blocked) throw new MemberError("找不到可見卡片 / Visible card not found", 404);
  const [stats, viewer] = await Promise.all([statsFor([row.userId]), viewerSources(userId)]);
  const card = publicCard({ ...cardDraftSchema.parse({ role: row.role, categories: row.categories, country: row.country, industry: row.industry, slogan: row.slogan, offers: row.offers, looksFor: row.looksFor, visibleFields: row.visibleFields }), id: row.id, displayName: row.displayName, sourcePolicy: row.sourcePolicy, revision: row.revision, blurredPhoto: row.blurredPhoto, lastActiveAt: row.lastActiveAt, verified: row.verified, recommended: row.recommended }, row.user.profile, stats.get(row.userId)!, viewer, new Date(), networkEnabled());
  return (await withChat(userId, [{ userId: row.userId, card }]))[0]!;
}
export async function recordActivity(userId: string, now = new Date()) {
  await prisma.matchmakingProfile.updateMany({ where: { userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lte: new Date(now.getTime() - 86400000) } }] }, data: { lastActiveAt: now } });
  return { saved: true };
}
