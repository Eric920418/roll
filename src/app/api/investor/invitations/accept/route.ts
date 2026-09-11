import { createHash } from "node:crypto";
import { getUserSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { ownerHasInvestorAccess } from "@/lib/investor/portal";

export async function POST(req: Request) {
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
    if (!ownerHasInvestorAccess(invitation.portal.user)) {
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
      return true;
    });
    if (!accepted) return fail("此邀請已被使用，請重新整理頁面。", 409);
    return ok({ portalId: invitation.portalId });
  } catch (error) {
    return failFromError(error);
  }
}
