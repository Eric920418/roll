import { discoveryInputSchema, discoveryStateSchema } from "@/lib/icp/discovery";
import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { icpDraftSchema } from "@/lib/icp/schema";
import { getIcpWorkspace, IcpError, patchIcp, runIcp } from "@/lib/icp/service";

export const maxDuration = 120;
const base = { revision: z.number().int().nonnegative(), requestId: z.string().uuid(), locale: z.enum(["en", "zh-tw"]).default("en") };
const postSchema = z.object({ ...base, action: z.enum(["answer", "retry", "discover"]), discovery: discoveryInputSchema.optional(), text: z.string().trim().min(1).max(4000).optional() }).strict();
const patchSchema = z.object({ ...base, action: z.enum(["edit", "save", "choose"]), discovery: discoveryStateSchema.optional(), draft: icpDraftSchema, profileVersion: z.number().int().nonnegative() }).strict();
function failure(error: unknown) {
  if (error instanceof IcpError) return fail(error.message, error.status);
  if (error instanceof z.ZodError) return fail(error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
  return failFromError(error);
}
function response(data: Awaited<ReturnType<typeof getIcpWorkspace>>) {
  const res = ok(data); res.headers.set("Cache-Control", "private, no-store"); return res;
}
export async function GET(req: NextRequest) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    return response(await getIcpWorkspace(session.uid, req.nextUrl.searchParams.get("locale") === "zh-tw" ? "zh-tw" : "en"));
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const account = await requirePlan("pro"); if (!account) return fail("此功能需 Pro 以上方案 / Pro plan or above required", 403);
    const input = postSchema.parse(await req.json());
    if (input.action === "discover" && !input.discovery) return fail("缺少 ICP 輸入 / Missing ICP input", 400);
    return response(await runIcp(account, input));
  } catch (error) { return failure(error); }
}
export async function PATCH(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    return response(await patchIcp(session.uid, patchSchema.parse(await req.json())));
  } catch (error) { return failure(error); }
}
