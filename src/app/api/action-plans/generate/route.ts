import { flowActions } from "@/lib/action-plan/flow/catalog";
import { browserMutationGuard } from "@/lib/security/http";
import { z } from "zod";
import { type NextRequest } from "next/server";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { getCurrentAccount } from "@/lib/auth/account";
import { DISCOVERY_POLICY, discoveryTrialActive } from "@/lib/discovery/policy";
import { confirmDiscoverySetup, discoverySetupResult } from "@/lib/discovery/setup";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { generateBodySchema } from "@/lib/action-plan/schemas";
import { assertGenerationAllowance, getActiveActionPlan, getPlanByRequestId, persistGeneratedPlan, PlanWriteError } from "@/lib/action-plan/service";

export const maxDuration = 300;
// Attempt throttle is separate from the three successful-plan allowance.
const DAILY_LIMIT = 10;

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    const account = await requirePlan("pro");
    const trial = account ? null : await getCurrentAccount();
    if (!account && (trial?.trialPolicy !== DISCOVERY_POLICY || !discoveryTrialActive(trial))) return fail("此功能需有效方案或訪談試用 / An active plan or interview trial is required", 403);
    const parsed = generateBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((issue) => `${issue.path.join(".") || "欄位"}：${issue.message}`).join("；"), 400);
    }
    if (!account) return ok(await confirmDiscoverySetup(session.uid, parsed.data), 201);

    const existing = await getPlanByRequestId(session.uid, parsed.data.requestId);
    if (existing) return ok(existing);
    await assertGenerationAllowance(session.uid);
    const rate = await checkRateLimit(`action-plan:generate:${session.uid}`, DAILY_LIMIT, DAY_MS);
    if (!rate.ok) return fail(`已達每日 ${DAILY_LIMIT} 次生成請求保護上限，請稍後再試。 / Daily generation request limit reached (${DAILY_LIMIT} attempts).`, 429);

    const basePlan = await getActiveActionPlan(session.uid);
    const actions = flowActions(parsed.data.diagnosis, parsed.data.locale);
    const plan = await persistGeneratedPlan({
      userId: session.uid,
      workflowVersion: 2,
      locale: parsed.data.locale,
      requestId: parsed.data.requestId,
      diagnosis: parsed.data.diagnosis,
      actions,
      answers: parsed.data.answers,
      personalization: parsed.data.personalization,
      basePlan: basePlan ? { id: basePlan.id, revision: basePlan.revision! } : null,
    });
    return ok(plan, 201);
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof Error && /timeout|timed out/i.test(error.name + error.message)) {
      return fail("AI 生成逾時，原計畫不變，請重試；回答仍保留。 / AI timed out. Your previous plan is unchanged; retry with your saved answers.", 504);
    }
    if (error instanceof Error && error.message.startsWith("NOVA Action Plan 驗證失敗")) {
      return fail(error.message, 422);
    }
    return failFromError(error);
  }
}

// Read-only recovery of an owned request; does not invoke AI or consume allowance.
export async function GET(req: NextRequest) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const parsed = z.string().uuid().safeParse(req.nextUrl.searchParams.get("requestId"));
    if (!parsed.success) return fail("請求 ID 無效 / Invalid request ID", 400);
    if (!await requirePlan("pro")) {
      const trial = await getCurrentAccount();
      if (trial?.trialPolicy !== DISCOVERY_POLICY) return fail("此功能需有效方案或訪談試用 / An active plan or interview trial is required", 403);
      return ok({ planId: await discoverySetupResult(session.uid, parsed.data) });
    }
    const result = await getPlanByRequestId(session.uid, parsed.data);
    return ok({ planId: result?.id || null });
  } catch (error) { return failFromError(error); }
}
