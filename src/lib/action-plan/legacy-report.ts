import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { commercialStateSchema } from "@/lib/validation/schema";
import { PlanWriteError } from "./service";
import { storedFindingSchema } from "./workspace";

type Plan = Prisma.ActionPlanGetPayload<{ include: { actions: true } }>;
const key = (planId: string) => "legacy_report_share:" + planId;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const shareSchema = z.object({ hash: z.string(), expires: z.iso.datetime(), fingerprint: z.string() });

// Share an explicit allowlist; interview records, attachments and finding quotations stay private.
export function legacyReportContent(plan: Plan) {
  return { goal: plan.goal || "", deadline: plan.goalDeadline?.toISOString().slice(0, 10) || null,
    tasks: [...plan.actions].sort((a, b) => (a.executionOrder ?? Infinity) - (b.executionOrder ?? Infinity) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).map(action => {
      const needsReview = commercialStateSchema.safeParse(action.commercialValidation).data?.requiresConfirmation === true;
      const finding = action.done && !needsReview ? storedFindingSchema.safeParse(action.taskFinding).data?.result : null;
      return { title: action.title, done: action.done, needsReview, completedAt: action.completedAt?.toISOString() || null, findings: finding?.cards.map(card => card.title) || [] };
    }),
  };
}
const fingerprint = (plan: Plan) => hash(JSON.stringify(legacyReportContent(plan)));

export async function legacyReportShared(plan: Plan) {
  const row = await prisma.setting.findUnique({ where: { key: key(plan.id) } });
  const share = shareSchema.safeParse(row?.value).data;
  return Boolean(share && Date.parse(share.expires) > Date.now() && share.fingerprint === fingerprint(plan));
}

export async function shareLegacyReport(tx: Prisma.TransactionClient, plan: Plan, enabled: boolean) {
  if (plan.archivedAt || plan.activeKey !== plan.userId || plan.actions.some(a => a.clientKey.startsWith("nova_v2_"))) throw new PlanWriteError("計畫已更新，請重新載入 / Plan changed; reload", 409);
  if (!enabled) { await tx.setting.deleteMany({ where: { key: key(plan.id) } }); return; }
  if (!plan.actions.length) throw new PlanWriteError("請先建立有任務的計畫 / Create a plan with tasks first", 409);
  const token = randomBytes(32).toString("base64url");
  const value = { hash: hash(token), expires: new Date(Date.now() + 30 * 86400000).toISOString(), fingerprint: fingerprint(plan) };
  await tx.setting.upsert({ where: { key: key(plan.id) }, create: { key: key(plan.id), value }, update: { value } });
  return "/task-report/" + plan.id + "?token=" + token;
}

export async function legacyReportAccess(planId: string, userId?: string, token?: string) {
  const plan = await prisma.actionPlan.findUnique({ where: { id: planId }, include: { actions: true } });
  if (!plan || plan.actions.some(a => a.clientKey.startsWith("nova_v2_"))) throw new PlanWriteError("找不到文件 / Document not found", 404);
  const row = await prisma.setting.findUnique({ where: { key: key(plan.id) } }), share = shareSchema.safeParse(row?.value).data;
  const version = fingerprint(plan), owner = plan.userId === userId;
  if (!owner || token) {
    if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token) || !share || share.hash !== hash(token) || Date.parse(share.expires) <= Date.now() || share.fingerprint !== version || plan.archivedAt || plan.activeKey !== plan.userId) throw new PlanWriteError("分享未開啟、已更新或已失效 / Sharing is disabled, updated or expired", 404);
  }
  return { kind: "legacy" as const, ...legacyReportContent(plan), planId: plan.id, owner, version: version.slice(0, 12), shareExpires: share?.expires || null, code: "NP-" + hash(plan.id).slice(0, 8).toUpperCase() };
}
