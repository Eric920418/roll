import { createHash } from "node:crypto";
import { browserMutationGuard } from "@/lib/security/http";
import { checkRateLimit, clientIp, DAY_MS, MINUTE_MS } from "@/lib/rate-limit";
import { memberError, privateOk } from "@/lib/member-http";
import { createReportRequest, reportRequestSchema } from "@/lib/reports/service";
export const maxDuration = 60;
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const raw = await req.text();
    if (raw.length > 6000) return Response.json({ error: "輸入過長 / Input too large", code: "invalid_input" }, { status: 413 });
    const input = reportRequestSchema.parse(JSON.parse(raw));
    if (input.website) return privateOk({ received: true, delivery: "pending", newsletterStatus: "not_requested" });
    const hash = (v: string) => createHash("sha256").update(v).digest("hex");
    if (!(await checkRateLimit("report-ip:" + hash(clientIp(req)), 10, 15 * MINUTE_MS)).ok || !(await checkRateLimit("report-mail:" + hash(input.email), 5, DAY_MS)).ok) return Response.json({ error: "嘗試過於頻繁，請稍後重試 / Too many attempts; retry later", code: "rate_limited" }, { status: 429 });
    return privateOk(await createReportRequest(input));
  } catch (e) { return memberError(e); }
}
