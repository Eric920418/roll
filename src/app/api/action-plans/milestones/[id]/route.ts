import { browserMutationGuard } from "@/lib/security/http";
import type { NextRequest } from "next/server";
import { fail, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { outcomePatchSchema } from "@/lib/roadmap/schema";
import { confirmMilestone } from "@/lib/roadmap/service";
import { roadmapFailure } from "@/lib/roadmap/http";
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try { const session = await getUserSession(); if (!session) return unauthorized(); if (!await requirePlan("pro")) return fail("此功能需 Pro 以上方案 / Pro plan required", 403); return ok(await confirmMilestone(session.uid, (await params).id, outcomePatchSchema.parse(await req.json()))); } catch (error) { return roadmapFailure(error); }
}
