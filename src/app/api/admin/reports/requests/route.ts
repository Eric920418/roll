import { requireAdmin } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { memberError, privateOk } from "@/lib/member-http";
export async function GET(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try {
    const cursor = new URL(req.url).searchParams.get("cursor");
    const rows = await prisma.marketReportRequest.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, createdAt: true, name: true, email: true, company: true, country: true, industry: true, reportLanguage: true, subscribe: true, newsletterStatus: true, newsletterError: true, deliveries: { select: { kind: true, status: true, attempts: true, acceptedAt: true, lastError: true } } } });
    return privateOk({ rows: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null });
  } catch (e) { return memberError(e); }
}
