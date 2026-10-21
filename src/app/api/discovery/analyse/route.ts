import { analyseValidation, analysisInputSchema } from "@/lib/validation/analysis";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth/account";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { browserMutationGuard } from "@/lib/security/http";
import { PlanWriteError } from "@/lib/action-plan/service";
import { analyseDiscovery } from "@/lib/discovery/analysis";
export const maxDuration = 90;
const input = z.object({ kind: z.enum(["preview", "full"]), locale: z.enum(["en", "zh-tw"]) }).strict();
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const account = await getCurrentAccount(); if (!account) return unauthorized();
    const body = await req.json();
    if (body.scope) {
      const parsed = analysisInputSchema.safeParse(body);
      if (!parsed.success) return fail(parsed.error.issues.map(i => i.message).join("; "), 400);
      return ok(await analyseValidation(account, parsed.data));
    }
    const parsed = input.safeParse(body); if (!parsed.success) return fail("無效分析請求 / Invalid analysis request", 400);
    return ok(await analyseDiscovery(account, parsed.data.kind === "full", parsed.data.locale));
  } catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}
