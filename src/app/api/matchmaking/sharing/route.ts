import { memberAccess, memberError, privateOk, MemberError } from "@/lib/member-http";
import { prisma } from "@/lib/prisma";
import { features, networkAccount } from "@/lib/network/access";
import { getOrCreateOwnerPortal, ownerPortalDto } from "@/lib/investor/portal";
import { canEditFieldVisibility } from "@/lib/investor/fields";
export async function GET(req: Request) {
  try {
    const uid = await memberAccess(); if (uid instanceof Response) return uid;
    if (!(await features(uid)).portal) throw new MemberError("投資人分享需要 NOVA 或有效分享授權 / Investor sharing requires NOVA or active sharing access", 403);
    const id = new URL(req.url).searchParams.get("checkInId");
    if (id && id.length > 200) throw new MemberError("週報識別碼無效 / Invalid update identifier", 400);
    const [account, portal, source] = await Promise.all([networkAccount(uid), getOrCreateOwnerPortal(uid), id ? prisma.weeklyCheckIn.findFirst({ where: { id, userId: uid }, select: { id: true, revision: true, investorDraft: true, weekStart: true } }) : null]);
    return privateOk({ portal: ownerPortalDto(portal), canHideFields: canEditFieldVisibility(account.effectivePlan), weeklyDraft: source?.investorDraft ? { id: source.id, revision: source.revision, body: source.investorDraft, title: `Weekly update · ${source.weekStart.toISOString().slice(0, 10)}` } : null });
  } catch (e) { return memberError(e); }
}
