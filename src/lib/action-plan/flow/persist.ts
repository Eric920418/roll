import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Diagnosis } from "../schemas";
import { actionRecord, serializePlan } from "../service";
import { legacyOrganizeData, organizeMetadata } from "../legacy-organize";
import type { readPlan } from "./service";
import { flowActions, flowMilestones, STEPS, STEP_TARGETS } from "./catalog";

export async function insertFlow(tx: Prisma.TransactionClient, planId: string, locale: string, diagnosis: Diagnosis, startsAt: string, deadline: string) {
  const milestones = await Promise.all(flowMilestones(startsAt, deadline, locale).map((m, position) => tx.planMilestone.create({ data: { ...m, position, targetDate: new Date(m.targetDate), actionPlanId: planId } })));
  const actions = flowActions(diagnosis, locale), ids = actions.map(() => randomUUID());
  await tx.actionItem.createMany({ data: actions.map((a, i) => ({ ...actionRecord(a, ids[i], a.clientKey, milestones[STEPS[i].milestone].id), commercialValidation: undefined, actionPlanId: planId, executionOrder: i, metricCurrent: 0, metricTarget: STEP_TARGETS[STEPS[i].id], metricUnit: locale === "zh-tw" ? "筆有效成果" : "verified records" })) });
  await tx.actionDependency.createMany({ data: ids.slice(1).map((id, i) => ({ actionId: id, dependsOnId: ids[i] })) });
}

export async function upgradeLegacyFlow(tx: Prisma.TransactionClient, plan: Awaited<ReturnType<typeof readPlan>>) {
  const templates = flowActions(serializePlan(plan).diagnosis, plan.locale);
  const originals = [1, 3, 4, 5, 2].map(n => plan.actions.find(a => a.clientKey === "task_" + n)!);
  const ids = templates.map((_, i) => originals[i]?.id || randomUUID());
  const market = await tx.onboardingProfile.findUnique({ where: { userId: plan.userId }, select: { targetMarkets: true } });
  for (const [i, template] of templates.entries()) {
    const step = STEPS[i].id, milestoneId = plan.milestones.find(m => m.position === STEPS[i].milestone)!.id;
    const original = originals[i];
    const common = { actionPlanId: plan.id, executionOrder: i, metricTarget: STEP_TARGETS[step], metricUnit: plan.locale === "zh-tw" ? "筆有效成果" : "verified records" };
    if (!original) {
      await tx.actionItem.create({ data: { ...actionRecord(template, ids[i], template.clientKey, milestoneId), ...common, commercialValidation: undefined, metricCurrent: 0 } });
      continue;
    }
    const meta = organizeMetadata(original.taskFinding);
    const organize = step === "01-2" || step === "01-3" ? legacyOrganizeData(original) : null;
    const hasOrganize = organize && (Boolean(meta.organizeData) || Object.values(organize.values).some(Boolean));
    await tx.actionItem.update({ where: { id: original.id }, data: {
      ...common, title: template.title, expectedOutcome: template.expectedOutcome, clientKey: template.clientKey, milestoneId,
      dependencyLevel: template.dependencyLevel, dependencyNotes: template.dependencyNotes, commercialValidation: Prisma.DbNull,
      metricCurrent: original.done ? original.metricCurrent : 0,
      taskWorkspace: hasOrganize ? { version: 2, step, data: organize } as Prisma.InputJsonValue : Prisma.DbNull,
      taskFinding: {
        ...meta,
        legacyFlow: {
          clientKey: original.clientKey, title: original.title, expectedOutcome: original.expectedOutcome,
          milestoneId: original.milestoneId, metric: [original.metricCurrent, original.metricTarget, original.metricUnit],
          dependencyLevel: original.dependencyLevel, dependencyNotes: original.dependencyNotes,
          dependencies: original.dependencies.map(d => [d.dependsOn.id, d.minimumCurrent]),
          workspace: original.taskWorkspace, commercialValidation: original.commercialValidation,
          ...(step === "01-1" ? { completed: original.done, market: market?.targetMarkets.length === 1 ? market.targetMarkets[0] : "" } : {}),
        },
      } as Prisma.InputJsonValue,
    } });
  }
  await tx.actionDependency.deleteMany({ where: { actionId: { in: originals.map(a => a.id) } } });
  await tx.actionDependency.createMany({ data: ids.slice(1).map((id, i) => ({ actionId: id, dependsOnId: ids[i] })) });
}
