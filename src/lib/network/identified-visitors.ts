import "server-only";
import { prisma } from "@/lib/prisma";
import { changed, MemberError } from "@/lib/member-http";
import { rewardTransaction } from "@/lib/rewards/service";
import { cardDraftSchema, publicCard } from "@/lib/matchmaking/schema";
import { requestHash, sourceSelect } from "@/lib/matchmaking/service";
import { requireNetwork } from "./access";
import { identityIsCurrent, privacyState, privacyWriteSchema, tourState, tourWriteSchema } from "./viewer-privacy";
import { weekKey } from "./policy";
export const identifiedViewsEnabled = () => process.env.NETWORK_IDENTIFIED_VIEWS_ENABLED !== "false";
export async function getViewerPrivacy(userId: string) {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { viewerPrivacy: true } });
  const { enabled, revision } = privacyState(row.viewerPrivacy);
  return { enabled, revision, available: identifiedViewsEnabled() };
}
export async function writeViewerPrivacy(userId: string, value: unknown) {
  const input = privacyWriteSchema.parse(value), hash = requestHash(input);
  if (input.enabled && !identifiedViewsEnabled()) throw new MemberError("公開瀏覽身份暫未開放 / Identified views are unavailable", 503);
  await rewardTransaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const row = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { viewerPrivacy: true } }), old = privacyState(row.viewerPrivacy);
    if (old.requestId === input.requestId) { if (old.hash !== hash) throw changed(); return; }
    if (old.revision !== input.revision) throw changed();
    // A new consent epoch cannot restore visits made under an earlier consent.
    const consentAt = input.enabled && !old.enabled ? new Date(Math.max(Date.now(), Date.parse(old.consentAt || "") + 1 || 0)).toISOString() : old.consentAt;
    await tx.user.update({ where: { id: userId }, data: { viewerPrivacy: { enabled: input.enabled, revision: old.revision + 1, consentAt, requestId: input.requestId, hash } } });
  });
  return getViewerPrivacy(userId);
}
export async function identifiedVisitors(userId: string, cursor?: string) {
  await requireNetwork(userId);
  if (!identifiedViewsEnabled()) return { members: [], next: null, available: false };
  const where = { ownerId: userId, week: weekKey(), identifiedAt: { not: null } };
  if (cursor && !await prisma.memberVisit.findFirst({ where: { ...where, id: cursor } })) throw new MemberError("訪客游標已失效 / Visitor cursor is no longer valid", 400);
  const blocked = await prisma.networkConnection.findMany({ where: { status: "blocked", OR: [{ senderId: userId }, { recipientId: userId }] }, select: { senderId: true, recipientId: true } });
  const excluded = new Set(blocked.flatMap(v => [v.senderId, v.recipientId]));
  const members: { card: ReturnType<typeof publicCard>; viewedAt: string; role: string; cursor: string }[] = [];
  let after = cursor;
  for (;;) {
    const rows = await prisma.memberVisit.findMany({ where, orderBy: [{ identifiedAt: "desc" }, { id: "desc" }], take: 100, ...(after ? { cursor: { id: after }, skip: 1 } : {}), include: { viewer: { select: { viewerPrivacy: true, matchmakingProfile: true, profile: { select: sourceSelect } } } } });
    for (const row of rows) {
      const card = row.viewer.matchmakingProfile;
      if (!card?.visible || excluded.has(row.viewerId) || !identityIsCurrent(row.viewer.viewerPrivacy, row.identityConsentAt, row.identifiedAt)) continue;
      members.push({ card: publicCard({ ...card, ...cardDraftSchema.parse({ displayName: card.displayName || "", role: card.role, categories: card.categories, country: card.country, industry: card.industry, slogan: card.slogan, offers: card.offers, looksFor: card.looksFor, visibleFields: card.visibleFields }) }, row.viewer.profile, { interviews: 0, payingCustomers: null, milestones: 0 }, null, new Date(), true), viewedAt: row.identifiedAt!.toISOString(), role: row.role, cursor: row.id });
      if (members.length > 24) return { members: members.slice(0, 24).map(v => ({ card: v.card, viewedAt: v.viewedAt, role: v.role })), next: members[23]!.cursor, available: true };
    }
    if (rows.length < 100) return { members: members.map(v => ({ card: v.card, viewedAt: v.viewedAt, role: v.role })), next: null, available: true };
    after = rows.at(-1)!.id;
  }
}
export async function getTour(userId: string) {
  return tourState((await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { nextStepsTour: true } })).nextStepsTour);
}
export async function writeTour(userId: string, value: unknown) {
  const input = tourWriteSchema.parse(value), hash = requestHash(input);
  await rewardTransaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const raw = (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { nextStepsTour: true } })).nextStepsTour;
    const old = tourState(raw), extra = raw as { requestId?: string; hash?: string } | null;
    if (extra?.requestId === input.requestId) { if (extra.hash !== hash) throw changed(); return; }
    if (old.revision !== input.revision) throw changed();
    await tx.user.update({ where: { id: userId }, data: { nextStepsTour: { ...input, revision: old.revision + 1, hash } } });
  });
  return getTour(userId);
}
