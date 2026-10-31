import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/api";
import { privateOk } from "@/lib/member-http";
import { prisma } from "@/lib/prisma";
import { configured } from "@/lib/prospecting/client";
import { utcPeriod } from "@/lib/prospecting/schema";
import { providerUsage } from "@/lib/prospecting/worker";
import { prospectingFailure } from "@/lib/prospecting/http";
export async function GET(req: Request) {
  try {
    if (!await getAdminSession()) return unauthorized();
    const params = new URL(req.url).searchParams;
    const cursor = z.string().uuid().optional().parse(params.get("cursor") || undefined);
    const [usage, orders] = await Promise.all([
      prisma.prospectingOrder.aggregate({ where: { period: utcPeriod() }, _sum: { deliveredCount: true, reservedCount: true }, _count: true }),
      prisma.prospectingOrder.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, status: true, count: true, deliveredCount: true, result: true, rejections: true, failureCode: true, failureMessage: true, providerRequestId: true, createdAt: true, acceptedAt: true, deliveredAt: true, attempts: true } }),
    ]);
    return privateOk({ enabled: configured(), period: utcPeriod(), delivered: usage._sum.deliveredCount || 0, reserved: usage._sum.reservedCount || 0, orders: orders.slice(0, 50).map(o => ({ ...o, result: undefined, usable: Array.isArray(o.result) ? o.result.length : 0, seconds: o.deliveredAt && o.acceptedAt ? Math.round((+o.deliveredAt - +o.acceptedAt) / 1000) : null })), nextCursor: orders.length > 50 ? orders[49].id : null, provider: params.get("usage") === "1" && configured() ? await providerUsage() : null });
  } catch (error) { return prospectingFailure(error); }
}
