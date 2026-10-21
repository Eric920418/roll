import { z } from "zod";
import { requirePlan } from "@/lib/billing/gate";
import { linkJourney, validationSnapshot } from "@/lib/validation/service";
import { getUserSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { PlanWriteError } from "@/lib/action-plan/service";
import { getDiscoverySnapshot, discoveryAccount, discoveryPaid } from "@/lib/discovery/service";
import { DISCOVERY_POLICY, discoveryTrialActive } from "@/lib/discovery/policy";

export async function GET() {
  try { const session = await getUserSession(); if (!session) return unauthorized(); return ok(await getDiscoverySnapshot(session.uid)); }
  catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, false); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const account = await discoveryAccount(session.uid);
    if (!account || account.trialPolicy !== DISCOVERY_POLICY) return fail("此帳號沿用原有流程 / This account retains its existing workflow", 403);
    if (!discoveryPaid(account) && !discoveryTrialActive(account)) return fail("試用已結束，升級後可開始 / Trial ended; upgrade to begin", 402);
    await prisma.discoveryJourney.upsert({ where: { userId: session.uid }, create: { userId: session.uid }, update: {} });
    return ok(await getDiscoverySnapshot(session.uid));
  } catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}

export async function PATCH(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!await requirePlan("pro")) return fail("升級後可連結後續計畫 / Upgrade to link a plan", 403);
    const input = z.object({ planId: z.string().min(1), journeyId: z.string().min(1), revision: z.number().int().nonnegative(), confirmed: z.literal(true) }).strict().parse(await req.json());
    await linkJourney(session.uid, input.planId, input.journeyId, input.revision);
    return ok(await validationSnapshot(session.uid, { planId: input.planId }));
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof z.ZodError) return fail(error.issues.map(i => i.message).join("; "), 400);
    return failFromError(error);
  }
}
