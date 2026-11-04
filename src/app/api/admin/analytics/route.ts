import { getAdminSession } from "@/lib/auth/guard";
import { AnalyticsError, analyticsReport, reportQuery } from "@/lib/admin/analytics";
import { unauthorized, rateLimited } from "@/lib/api";
import { privateOk, memberError } from "@/lib/member-http";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";

export async function GET(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) return unauthorized();
    const rate = await checkRateLimit("admin-analytics", 30, MINUTE_MS);
    if (!rate.ok) return rateLimited(rate.retryAfterMs);
    const { days, feature } = reportQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return privateOk(await analyticsReport(Number(days), feature));
  } catch (error) {
    if (error instanceof AnalyticsError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    return memberError(error);
  }
}
