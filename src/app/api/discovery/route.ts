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
