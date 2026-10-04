import { type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { browserMutationGuard } from "@/lib/security/http";
import { ok, fail, failFromError, unauthorized } from "@/lib/api";
import { stageOutcomeSchema, stageOutcomeMet, uniqueStagePeople, stageEvidence } from "@/lib/customer-insights/schema";
import { rewardTransaction, awardReward, RewardError } from "@/lib/rewards/service";
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案 / Pro plan required", 403);
    const input = stageOutcomeSchema.parse(await req.json());
    const result = await rewardTransaction(async tx => {
      const existing = await tx.customerStageOutcome.findUnique({ where: { userId_stage: { userId: session.uid, stage: input.stage } } });
      if (existing) return { awarded: false, confirmedAt: existing.confirmedAt };
      const notes = await tx.meetingNote.findMany({ where: { userId: session.uid }, select: { id: true, insight: true } });
      const people = uniqueStagePeople(input.stage, notes.map(n => n.insight));
      if (!stageOutcomeMet(input, people)) throw new RewardError("尚未達標：請先保存足夠且含筆記的相應類型對話，並確認實際成果。重複姓名／公司只計一次。 / Goal not met. Save enough relevant conversations with notes and confirm real outcomes; duplicate people count once.", 400);
      const evidence = notes.filter(n => stageEvidence(input.stage, [n.insight]).length).map(n => ({ id: n.id, insight: n.insight }));
      const saved = await tx.customerStageOutcome.create({ data: { userId: session.uid, stage: input.stage, primaryCount: input.stage === "discover" || input.stage === "angel_round" ? people : input.primaryCount, secondaryCount: input.secondaryCount, note: input.note, evidence: evidence as unknown as Prisma.InputJsonValue } });
      const awarded = await awardReward(tx, session.uid, "customer_stage", input.stage);
      return { awarded, confirmedAt: saved.confirmedAt };
    }); return ok(result);
  } catch (error) { if (error instanceof RewardError) return fail(error.message, error.status); if (error instanceof z.ZodError) return fail(error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400); if (error instanceof SyntaxError) return fail("Invalid JSON / 無效 JSON", 400); return failFromError(error); }
}
