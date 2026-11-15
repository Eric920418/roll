import { requireAdmin } from "@/lib/auth/guard";
import { unauthorized, rateLimited } from "@/lib/api";
import { browserMutationGuard } from "@/lib/security/http";
import { memberError, privateOk } from "@/lib/member-http";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { adminRoundtables, manageRoundtable } from "@/lib/roundtables/service";
import { adminRoundtableMutationSchema } from "@/lib/roundtables/schema";

export async function GET() {
  try { if (!await requireAdmin()) return unauthorized(); return privateOk(await adminRoundtables()); }
  catch (error) { return memberError(error); }
}
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const admin = await requireAdmin(); if (!admin) return unauthorized();
    const limit = await checkRateLimit("admin-roundtables:" + admin.email, 40, MINUTE_MS); if (!limit.ok) return rateLimited(limit.retryAfterMs);
    const text = await req.text(); if (text.length > 40000) return Response.json({ error: "內容過大 / Request too large", code: "request_too_large" }, { status: 413 });
    const selectedId = await manageRoundtable(adminRoundtableMutationSchema.parse(JSON.parse(text)));
    return privateOk({ ...(await adminRoundtables()), selectedId });
  } catch (error) { return memberError(error); }
}
