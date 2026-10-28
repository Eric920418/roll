import { networkEnabled, pairKey } from "@/lib/network/policy";
import type { Prisma } from "@prisma/client";
import { browserMutationGuard } from "@/lib/security/http";
import { createHash } from "node:crypto";
import { getUserSession } from "@/lib/auth/guard";
import { getBetaAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { ownerHasInvestorAccess } from "@/lib/investor/portal";

export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return fail("邀請連結格式無效。", 400);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invitation = await prisma.investorInvitation.findUnique({
      where: { tokenHash },
      include: { portal: { include: { user: true } } },
    });
    if (!invitation || invitation.status !== "pending") return fail("邀請不存在、已使用或已撤銷。", 404);
    if (invitation.networkPolicy === 2 && !networkEnabled()) return fail("新制分享暫時停用，請稍後再試 / Sharing is temporarily unavailable", 503);
    if (invitation.portal.userId === session.uid) return fail("不可接受自己的邀請 / Cannot accept your own invitation", 403);
    if (!ownerHasInvestorAccess(invitation.portal.user, await getBetaAccess())) {
      return fail("此 Investor Portal 目前無法使用。", 404);
    }
    if (invitation.expiresAt <= new Date()) {
      await prisma.investorInvitation.updateMany({
        where: { id: invitation.id, status: "pending" },
        data: { status: "expired", activeKey: null, tokenHash: null },
      });
      return fail("邀請已過期，請聯絡公司重新寄送。", 410);
    }
    if (session.email.toLowerCase() !== invitation.invitedEmail) {
      return fail(`此邀請只適用於 ${invitation.invitedEmail}，請先以該 Email 登入。`, 403);
    }

    const accepted = await prisma.$transaction(async (tx) => {
      const result = await tx.investorInvitation.updateMany({
        where: { id: invitation.id, status: "pending", tokenHash },
        data: {
          status: "accepted",
          acceptedByUserId: session.uid,
          acceptedAt: new Date(),
          activeKey: null,
          tokenHash: null,
        },
      });
      if (!result.count) return false;
      await tx.user.updateMany({
        where: { id: session.uid, emailVerified: null },
        data: { emailVerified: new Date() },
      });
      if (networkEnabled() && invitation.networkPolicy === 2) {
        const key = pairKey(invitation.portal.userId, session.uid);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
        const prior = await tx.networkConnection.findUnique({ where: { pairKey: key } });
        if (prior?.status === "blocked") throw new Error("連結已封鎖 / Connection blocked");
        const link = await tx.networkConnection.upsert({ where: { pairKey: key }, create: { pairKey: key, senderId: invitation.portal.userId, recipientId: session.uid, status: "accepted", acceptedAt: new Date() }, update: { status: "accepted", acceptedAt: new Date(), revision: { increment: 1 } } });
        await (await import("@/lib/network/notifications")).queueNotification(tx as unknown as Prisma.TransactionClient, invitation.portal.userId, `share-request:${invitation.id}`, "invitation", { connectionId: link.id });
      }
      return true;
    });
    if (!accepted) return fail("此邀請已被使用，請重新整理頁面。", 409);
    return ok({ portalId: invitation.portalId, awaitingConsent: networkEnabled() && invitation.networkPolicy === 2 });
  } catch (error) {
    return failFromError(error);
  }
}
