import { createHash, randomBytes } from "node:crypto";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { resolveBillingAppOrigin } from "@/lib/billing/config";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getOrCreateOwnerPortal } from "@/lib/investor/portal";
import { inviteSchema } from "@/lib/investor/validation";
import { sendInvestorInvitation } from "@/lib/investor/email";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function POST(req: Request) {
  try {
    const account = await getCurrentAccount();
    if (!account) return unauthorized();
    if (!planAtLeast(getEffectivePlan(account), "business")) {
      return fail("Investor Portal 邀請需要 Business 以上方案。", 403);
    }
    const parsed = inviteSchema.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues.map((item) => item.message).join("\n"));
    const portal = await getOrCreateOwnerPortal(account.id);
    const companyName = account.profile?.companyName || account.firstName || "ROLL ON. member";
    const emailHash = hash(parsed.data.email).slice(0, 24);
    const [companyLimit, emailLimit] = await Promise.all([
      checkRateLimit(`investor-invite:${portal.id}`, 20, DAY_MS, false),
      checkRateLimit(`investor-invite:${portal.id}:${emailHash}`, 5, DAY_MS, false),
    ]);
    if (!companyLimit.ok) return fail("今天已寄出 20 封投資人邀請，請於限制重置後再試。", 429);
    if (!emailLimit.ok) return fail("此 Email 今天已重寄 5 次，請於限制重置後再試。", 429);

    const activeKey = `${portal.id}:${parsed.data.email}`;
    const accepted = await prisma.investorInvitation.findFirst({
      where: {
        portalId: portal.id,
        invitedEmail: parsed.data.email,
        status: "accepted",
      },
      select: { id: true },
    });
    if (accepted) return fail("此投資人已接受邀請。", 409);
    const existing = await prisma.investorInvitation.findUnique({ where: { activeKey } });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hash(token);
    const expiresAt = new Date(Date.now() + 7 * DAY_MS);
    const invitation = existing
      ? await prisma.investorInvitation.update({
          where: { id: existing.id },
          data: { tokenHash, expiresAt, status: "pending", revokedAt: null },
        })
      : await prisma.investorInvitation.create({
          data: {
            portalId: portal.id,
            invitedEmail: parsed.data.email,
            activeKey,
            tokenHash,
            expiresAt,
          },
        });

    const origin = resolveBillingAppOrigin(req.url);
    await sendInvestorInvitation({
      to: parsed.data.email,
      companyName,
      locale: parsed.data.locale,
      inviteUrl: `${origin}${parsed.data.locale === "zh-tw" ? "/zh-tw" : ""}/investor/invite/${token}`,
    });
    await prisma.investorInvitation.update({
      where: { id: invitation.id },
      data: { lastSentAt: new Date() },
    });
    return ok({ id: invitation.id, email: invitation.invitedEmail, expiresAt: expiresAt.toISOString() }, 201);
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Resend") || error.message.includes("RESEND_"))) {
      console.error("[investor invitation]", error);
      return fail(`${error.message}\n請確認寄件網域已完成 SPF／DKIM 驗證後重試。`, 502);
    }
    return failFromError(error);
  }
}
