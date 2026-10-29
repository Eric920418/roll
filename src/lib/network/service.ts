import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { changed, MemberError } from "@/lib/member-http";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { acceptedConnection, activeShare, features, networkAccount, requireNetwork } from "./access";
import { CONDITIONS, connectionSchema, inviteSchema, messageSchema, networkEnabled, pairKey, shareSchema, weekKey, visitorPeriods } from "./policy";
import { progressSnapshot, evaluateWatches } from "./watches";
import { queueNotification } from "./notifications";
import type { z } from "zod";
type DB = Prisma.TransactionClient;
export function requireEnabled() { if (!networkEnabled()) throw new MemberError("會員網絡新功能尚未開放 / Member network is not available yet", 503); }
async function connection(db: DB, userId: string, id: string, lock = false) {
  if (lock) await db.$queryRaw`SELECT "id" FROM "NetworkConnection" WHERE "id" = ${id} FOR UPDATE`;
  const row = await db.networkConnection.findUnique({ where: { id } });
  if (!row || ![row.senderId, row.recipientId].includes(userId)) throw new MemberError("找不到連結 / Connection not found", 404);
  return row;
}
export async function invite(userId: string, input: z.infer<typeof inviteSchema>) {
  requireEnabled(); await requireNetwork(userId, "invite");
  const target = await prisma.matchmakingProfile.findFirst({ where: { id: input.profileId, visible: true } });
  if (!target || target.userId === userId) throw new MemberError("無法邀請此會員 / Cannot invite this member", 404);
  if (input.conditions.length && !(await networkAccount(userId)).verifiedInvestor) throw new MemberError("觀察條件僅供已驗證投資人 / Verified investors only", 403);
  const key = pairKey(userId, target.userId);
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
    if (!await tx.matchmakingProfile.findFirst({ where: { id: target.id, visible: true } })) throw new MemberError("此卡片已隱藏 / This card is hidden", 404);
    let row = await tx.networkConnection.findUnique({ where: { pairKey: key } });
    if (row?.status === "blocked") throw new MemberError("此連結無法接受邀請 / Connection unavailable", 403);
    if (row?.status === "declined" && Date.now() - row.updatedAt.getTime() < 7 * DAY_MS) throw new MemberError("邀請已拒絕，七天後可再試 / Invitation declined; retry after seven days", 409);
    if (!row || row.status === "declined") {
      if (!(await checkRateLimit(`network-invite:${userId}`, 20, DAY_MS, false, tx)).ok) throw new MemberError("今日邀請上限為 20 次 / Daily limit: 20 invitations", 429);
      row = row ? await tx.networkConnection.update({ where: { id: row.id }, data: { senderId: userId, recipientId: target.userId, status: "pending", revision: { increment: 1 } } }) : await tx.networkConnection.create({ data: { pairKey: key, senderId: userId, recipientId: target.userId } });
      await queueNotification(tx, target.userId, `invite:${row.id}:${row.revision}`, "invitation", { connectionId: row.id });
    }
    for (const condition of new Set(input.conditions)) await tx.investorWatch.upsert({ where: { investorId_startupId_condition_scopeKey: { investorId: userId, startupId: target.userId, condition, scopeKey: "pending" } }, create: { connectionId: row.id, investorId: userId, startupId: target.userId, condition }, update: {} });
    const granted = await tx.networkShare.findUnique({ where: { ownerId_viewerId: { ownerId: target.userId, viewerId: userId } } });
    if (granted && !granted.revokedAt && granted.sections.includes("signals")) await evaluateWatches(tx, target.userId);
    return { id: row.id, status: row.status };
  });
}
export async function listConnections(userId: string) {
  const rows = await prisma.networkConnection.findMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] }, orderBy: { updatedAt: "desc" }, take: 50, include: { sender: { select: { profile: { select: { companyName: true } }, matchmakingProfile: { select: { id: true, role: true, verified: true, blurredPhoto: true } } } }, recipient: { select: { profile: { select: { companyName: true } }, matchmakingProfile: { select: { id: true, role: true, verified: true, blurredPhoto: true } } } }, shares: true, watches: { select: { id: true, condition: true, status: true, investorId: true } } } });
  return Promise.all(rows.map(async r => {
    const outgoing = r.senderId === userId, peer = outgoing ? r.recipient : r.sender;
    const peerId = outgoing ? r.recipientId : r.senderId;
    const receivedShare = r.shares.find(s => s.viewerId === userId && !s.revokedAt);
    const permitted = receivedShare && await activeShare(peerId, userId, receivedShare.sections[0] || "signals");
    const portal = permitted ? await prisma.investorPortal.findUnique({ where: { userId: peerId }, select: { id: true } }) : null;
    const signalShare = await activeShare(peerId, userId, "signals");
    const signalScope = (await import("./policy")).scope.safeParse(signalShare?.scope);
    let privateProgress: Awaited<ReturnType<typeof progressSnapshot>> | null = null;
    if (signalScope.success) { try { privateProgress = await progressSnapshot(prisma as unknown as DB, peerId, signalScope.data); } catch { /* An archived workspace grants no current progress. */ } }
    return { portalId: portal?.id, privateProgress, photo: r.status === "accepted" && peer.matchmakingProfile?.blurredPhoto ? `/api/matchmaking/members/${peer.matchmakingProfile.id}/photo` : null, id: r.id, status: r.status, revision: r.revision, outgoing, company: peer.profile?.companyName || "Member", profileId: peer.matchmakingProfile?.id, verified: peer.matchmakingProfile?.verified, role: peer.matchmakingProfile?.role, unread: r.status === "accepted" ? await prisma.networkMessage.count({ where: { connectionId: r.id, senderId: { not: userId }, createdAt: { gt: (outgoing ? r.senderReadAt : r.recipientReadAt) || new Date(0) } } }) : 0, sharing: r.shares.filter(s => s.ownerId === userId).map(s => ({ revision: s.revision, sections: s.revokedAt ? [] : s.sections, scope: s.scope }))[0] || { revision: 0, sections: [], scope: null }, watches: r.watches.map(w => ({ id: w.id, condition: w.condition, status: w.status, mine: w.investorId === userId })) };
  }));
}
export async function changeConnection(userId: string, id: string, input: z.infer<typeof connectionSchema>) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB, row = await connection(tx, userId, id, true);
    if (input.action === "read") {
      const latest = await tx.networkMessage.findFirst({ where: { connectionId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (latest) await tx.networkConnection.update({ where: { id }, data: row.senderId === userId ? { senderReadAt: latest.createdAt } : { recipientReadAt: latest.createdAt } });
      return { saved: true };
    }
    const status = { accept: "accepted", decline: "declined", block: "blocked" }[input.action];
    if (row.status === status && (status !== "blocked" || row.blockedBy === userId)) return { saved: true };
    if (row.revision !== input.revision) throw changed();
    if (input.action !== "block" && (row.recipientId !== userId || row.status !== "pending")) throw new MemberError("只有收件者能處理待接受邀請 / Only the recipient can respond to a pending invitation", 403);
    await tx.networkConnection.update({ where: { id }, data: { status, revision: { increment: 1 }, ...(status === "accepted" ? { acceptedAt: new Date() } : {}), ...(status === "blocked" ? { blockedBy: userId } : {}) } });
    if (status === "blocked") {
      await tx.networkShare.updateMany({ where: { connectionId: id }, data: { revokedAt: new Date(), revision: { increment: 1 } } });
      await tx.investorWatch.updateMany({ where: { connectionId: id }, data: { status: "paused" } });
    }
    return { saved: true };
  });
}
export async function messages(userId: string, id: string, cursor?: string) {
  const row = await connection(prisma as unknown as DB, userId, id);
  if (!["accepted", "blocked"].includes(row.status)) throw new MemberError("請先接受聊天邀請 / Accept the chat invitation first", 403);
  if (cursor && !await prisma.networkMessage.findFirst({ where: { id: cursor, connectionId: id } })) throw new MemberError("訊息游標無效 / Invalid cursor", 400);
  const rows = await prisma.networkMessage.findMany({ where: { connectionId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  return { messages: rows.slice(0, 50).reverse().map(m => ({ id: m.id, body: m.body, mine: m.senderId === userId, createdAt: m.createdAt })), next: rows.length > 50 ? rows[49]!.id : null };
}
export async function sendMessage(userId: string, id: string, input: z.infer<typeof messageSchema>) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB, row = await connection(tx, userId, id, true);
    const previous = await tx.networkMessage.findUnique({ where: { senderId_requestId: { senderId: userId, requestId: input.requestId } } });
    if (previous) { if (previous.connectionId !== id || previous.body !== input.body) throw changed(); return { id: previous.id }; }
    if (row.status !== "accepted") throw new MemberError("聊天尚未接受或已封鎖 / Chat is pending or blocked", 403);
    const saved = await tx.networkMessage.create({ data: { connectionId: id, senderId: userId, ...input } });
    await tx.networkConnection.update({ where: { id }, data: { updatedAt: new Date() } });
    return { id: saved.id };
  });
}
export async function share(userId: string, id: string, input: z.infer<typeof shareSchema>) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB, row = await connection(tx, userId, id, true), viewerId = row.senderId === userId ? row.recipientId : row.senderId;
    if (input.sections.length && (row.status !== "accepted" || !(await features(userId, tx)).portal || !(await networkAccount(viewerId, tx)).verifiedInvestor)) throw new MemberError("分享需要已接受連結、NOVA 權限及已驗證投資人 / Sharing requires an accepted connection, NOVA and a verified investor", 403);
    if (input.scope) await progressSnapshot(tx, userId, input.scope);
    const old = await tx.networkShare.findUnique({ where: { ownerId_viewerId: { ownerId: userId, viewerId } } });
    if ((old?.revision || 0) !== input.revision) {
      const sameScope = JSON.stringify(old?.scope || null) === JSON.stringify(input.scope || null);
      if (old?.revision === input.revision + 1 && sameScope && old.sections.length === input.sections.length && old.sections.every(s => input.sections.includes(s as typeof input.sections[number]))) return { revision: old.revision };
      throw changed();
    }
    const saved = await tx.networkShare.upsert({ where: { ownerId_viewerId: { ownerId: userId, viewerId } }, create: { ownerId: userId, viewerId, connectionId: id, sections: input.sections, scope: input.scope ? input.scope : Prisma.DbNull }, update: { connectionId: id, sections: input.sections, scope: input.scope ? input.scope : Prisma.DbNull, revokedAt: input.sections.length ? null : new Date(), revision: { increment: 1 }, grantedAt: new Date() } });
    const portal = await tx.investorPortal.upsert({ where: { userId }, create: { userId }, update: {} });
    const viewer = await tx.user.findUniqueOrThrow({ where: { id: viewerId }, select: { email: true } });
    const invitation = await tx.investorInvitation.findFirst({ where: { portalId: portal.id, invitedEmail: viewer.email, status: "accepted" } });
    if (!invitation && input.sections.length) await tx.investorInvitation.create({ data: { portalId: portal.id, invitedEmail: viewer.email, networkPolicy: 2, status: "accepted", acceptedByUserId: viewerId, acceptedAt: new Date(), expiresAt: new Date("2099-01-01") } });
    if (input.sections.includes("signals") && old?.scope && JSON.stringify(old.scope) !== JSON.stringify(input.scope)) {
      const priorWatches = await tx.investorWatch.findMany({ where: { connectionId: id, startupId: userId, status: { notIn: ["disabled", "merged"] } } });
      for (const watch of priorWatches) await tx.investorWatch.upsert({ where: { investorId_startupId_condition_scopeKey: { investorId: viewerId, startupId: userId, condition: watch.condition, scopeKey: "pending" } }, create: { connectionId: id, investorId: viewerId, startupId: userId, condition: watch.condition }, update: {} });
    }
    if (!input.sections.includes("signals")) await tx.investorWatch.updateMany({ where: { connectionId: id, startupId: userId, status: { notIn: ["disabled", "merged"] } }, data: { status: "paused" } });
    await evaluateWatches(tx, userId);
    return { revision: saved.revision };
  });
}
export async function recordVisit(userId: string, input: { profileId?: string; portalId?: string }) {
  let ownerId: string | undefined;
  if (input.profileId) {
    const card = await prisma.matchmakingProfile.findFirst({ where: { id: input.profileId, visible: true }, select: { userId: true } });
    ownerId = card?.userId;
    if (ownerId !== userId && ownerId && !(await acceptedConnection(ownerId, userId))) await requireNetwork(userId);
  } else if (input.portalId) {
    const { getInvestorView } = await import("@/lib/investor/portal");
    if (await getInvestorView(input.portalId, userId)) ownerId = (await prisma.investorPortal.findUnique({ where: { id: input.portalId }, select: { userId: true } }))?.userId;
  }
  if (!ownerId) throw new MemberError("找不到可見頁面 / Visible page not found", 404);
  if (ownerId === userId) return { recorded: false };
  const viewer = await networkAccount(userId);
  await prisma.memberVisit.createMany({ data: [{ ownerId, viewerId: userId, week: weekKey(), role: viewer.verifiedInvestor ? "investor" : viewer.matchmakingProfile?.role === "founder" ? "founder" : "other" }], skipDuplicates: true });
  return { recorded: true };
}
export async function visitorSummary(userId: string, week = weekKey(), now = new Date()) {
  const periods = visitorPeriods(now);
  const [rows, previous, marker] = await Promise.all([
    prisma.memberVisit.groupBy({ by: ["role"], where: { ownerId: userId, week, createdAt: { lte: now } }, _count: true }),
    prisma.memberVisit.groupBy({ by: ["role"], where: { ownerId: userId, week: periods.previousWeek, createdAt: { lte: periods.previousCutoff } }, _count: true }),
    prisma.setting.findUnique({ where: { key: "member_network_v2_snapshot" }, select: { value: true } }),
  ]);
  const counts = (values: typeof rows) => ({ investors: values.find(r => r.role === "investor")?._count || 0, founders: values.find(r => r.role === "founder")?._count || 0, others: values.find(r => r.role === "other")?._count || 0 });
  const coverage = typeof marker?.value === "string" ? Date.parse(marker.value) : NaN;
  return { week, ...counts(rows), previous: counts(previous), comparable: Number.isFinite(coverage) && coverage <= periods.previousStart.getTime(), asOf: now.toISOString(), previousAsOf: periods.previousCutoff.toISOString() };
}
export async function connectionForProfile(userId: string, profileId: string) {
  const profile = await prisma.matchmakingProfile.findUnique({ where: { id: profileId }, select: { userId: true, visible: true } });
  if (!profile) throw new MemberError("找不到卡片 / Card not found", 404);
  if (profile.userId === userId) return { own: true, connection: null };
  const row = await prisma.networkConnection.findUnique({ where: { pairKey: pairKey(userId, profile.userId) } });
  if (!row && !profile.visible) throw new MemberError("找不到卡片 / Card not found", 404);
  if (!row) await requireNetwork(userId);
  return { own: false, connection: row ? { id: row.id, status: row.status, revision: row.revision, outgoing: row.senderId === userId } : null };
}
export async function canReadSection(ownerId: string, viewerId: string, section: string) { return Boolean(await activeShare(ownerId, viewerId, section)); }
export { CONDITIONS };
