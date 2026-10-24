import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guard";
import { unauthorized, rateLimited } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { changed, MemberError, memberError, privateOk } from "@/lib/member-http";
import { browserMutationGuard } from "@/lib/security/http";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
const selection = { id: true, role: true, country: true, industry: true, slogan: true, visible: true, verified: true, recommended: true, revision: true, reviewedAt: true, user: { select: { email: true } } } as const;
export async function GET(req: Request) {
  try {
    if (!await getAdminSession()) return unauthorized();
    const page = z.coerce.number().int().min(1).max(10000).parse(new URL(req.url).searchParams.get("page") || 1);
    const rows = await prisma.matchmakingProfile.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 30, take: 31, select: selection });
    return privateOk({ rows: rows.slice(0, 30), hasMore: rows.length > 30 });
  } catch (error) { return memberError(error); }
}
export async function PATCH(req: Request) {
  const blocked = browserMutationGuard(req); if (blocked) return blocked;
  try {
    if (!await getAdminSession()) return unauthorized();
    const rate = await checkRateLimit("admin-matchmaking", 40, MINUTE_MS); if (!rate.ok) return rateLimited(rate.retryAfterMs);
    const input = z.object({ id: z.string().min(1), revision: z.number().int().nonnegative(), verified: z.boolean(), recommended: z.boolean() }).strict().parse(await req.json());
    const row = await prisma.matchmakingProfile.findUnique({ where: { id: input.id }, select: { role: true } });
    if (!row) throw new MemberError("找不到卡片 / Card not found", 404);
    if (input.verified && !["investor", "buyer"].includes(row.role)) throw new MemberError("只有投資人與買家可設角色驗證 / Role verification is available for investors and buyers only", 400);
    const saved = await prisma.matchmakingProfile.updateMany({ where: { id: input.id, revision: input.revision, role: row.role }, data: { verified: input.verified, recommended: input.recommended, reviewedAt: new Date(), revision: { increment: 1 } } });
    if (!saved.count) throw changed();
    return privateOk({ saved: true });
  } catch (error) { return memberError(error); }
}
