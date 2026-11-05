import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Diagnosis } from "../schemas";
import { actionRecord } from "../service";
import { flowActions, flowMilestones, STEPS, STEP_TARGETS } from "./catalog";

export async function insertFlow(tx: Prisma.TransactionClient, planId: string, locale: string, diagnosis: Diagnosis, startsAt: string, deadline: string) {
  const milestones = await Promise.all(flowMilestones(startsAt, deadline, locale).map((m, position) => tx.planMilestone.create({ data: { ...m, position, targetDate: new Date(m.targetDate), actionPlanId: planId } })));
  const actions = flowActions(diagnosis, locale), ids = actions.map(() => randomUUID());
  await tx.actionItem.createMany({ data: actions.map((a, i) => ({ ...actionRecord(a, ids[i], a.clientKey, milestones[STEPS[i].milestone].id), commercialValidation: undefined, actionPlanId: planId, executionOrder: i, metricCurrent: 0, metricTarget: STEP_TARGETS[STEPS[i].id], metricUnit: locale === "zh-tw" ? "筆有效成果" : "verified records" })) });
  await tx.actionDependency.createMany({ data: ids.slice(1).map((id, i) => ({ actionId: id, dependsOnId: ids[i] })) });
}
