import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validationRows, validationDeals } from "@/lib/validation/service";
import { commitmentSummary } from "@/lib/validation/schema";
import { interviewCompanies } from "@/lib/matchmaking/schema";
import { MemberError } from "@/lib/member-http";
import { activeShare, networkAccount } from "./access";
import { conditionMet, networkEnabled, scope, scopeKey } from "./policy";
import { queueNotification } from "./notifications";
import type { z } from "zod";
type DB = Prisma.TransactionClient;
export async function progressSnapshot(db: DB, userId: string, selected: z.infer<typeof scope>) {
  const context = await validationRows(db, userId, selected), interviews = interviewCompanies(context.rows.map(r => r.insight));
  const actions = context.actions.filter(a => a.recordingMode === "interview"), target = actions.length ? Math.max(...actions.map(a => a.metricTarget || 10)) : 10;
  const portal = await db.investorPortal.findUnique({ where: { userId }, select: { fundraisingOpenAt: true } });
  return { interviews, target, complete: interviews >= target && (actions.length ? actions.every(a => a.done) : Boolean(context.journey?.interviewsConfirmedAt)), paid: commitmentSummary((await validationDeals(db, userId, selected)).map(d => d.record)).paid, fundraising: Boolean(portal?.fundraisingOpenAt) };
}
export async function evaluateWatches(tx: DB, userId: string) {
  if (!networkEnabled()) return;
  const rows = await tx.investorWatch.findMany({ where: { startupId: userId, status: { in: ["pending", "active", "paused", "queued", "notified"] } } });
  const grants = new Map<string, Awaited<ReturnType<typeof activeShare>>>(), snapshots = new Map<string, Awaited<ReturnType<typeof progressSnapshot>>>();
  for (let row of rows) {
    if (!grants.has(row.investorId)) grants.set(row.investorId, await activeShare(userId, row.investorId, "signals", tx));
    const grant = grants.get(row.investorId), selected = scope.safeParse(grant?.scope);
    if (!grant || !selected.success) { if (row.status !== "pending") await tx.investorWatch.update({ where: { id: row.id }, data: { status: "paused" } }); continue; }
    const key = scopeKey(selected.data);
    if (row.scopeKey === "pending") {
      const previous = await tx.investorWatch.findUnique({ where: { investorId_startupId_condition_scopeKey: { investorId: row.investorId, startupId: userId, condition: row.condition, scopeKey: key } } });
      if (previous) { await tx.investorWatch.update({ where: { id: row.id }, data: { status: "merged" } }); continue; }
      row = await tx.investorWatch.update({ where: { id: row.id }, data: { scopeKey: key, status: "active" } });
    }
    if (row.scopeKey !== key) { await tx.investorWatch.update({ where: { id: row.id }, data: { status: "paused" } }); continue; }
    let progress;
    try { if (!snapshots.has(key)) snapshots.set(key, await progressSnapshot(tx, userId, selected.data)); progress = snapshots.get(key)!; }
    catch { await tx.investorWatch.update({ where: { id: row.id }, data: { status: "paused" } }); continue; }
    if (!row.notifiedAt && conditionMet(row.condition, progress)) {
      const owner = await tx.onboardingProfile.findUnique({ where: { userId }, select: { companyName: true } });
      await queueNotification(tx, row.investorId, `watch:${row.id}`, "watch", { watchId: row.id, ownerId: userId, company: owner?.companyName || "Company", condition: row.condition }, true);
      await tx.investorWatch.update({ where: { id: row.id }, data: { notifiedAt: new Date(), status: "queued" } });
    } else if (row.notifiedAt && ["active", "paused"].includes(row.status)) {
      const event = await tx.memberNotification.findUnique({ where: { eventKey: `watch:${row.id}` }, include: { delivery: true } });
      const status = event?.delivery?.status === "accepted" ? "notified" : ["pending", "processing"].includes(event?.delivery?.status || "") ? "queued" : "paused";
      await tx.investorWatch.update({ where: { id: row.id }, data: { status } });
    } else if (!row.notifiedAt) await tx.investorWatch.update({ where: { id: row.id }, data: { status: "active" } });
  }
}
export async function watchStillValid(db: DB, watchId: string) {
  const watch = await db.investorWatch.findUnique({ where: { id: watchId } });
  if (!watch || !["queued", "notified", "active"].includes(watch.status)) return false;
  const share = await activeShare(watch.startupId, watch.investorId, "signals", db), selected = scope.safeParse(share?.scope);
  if (!selected.success || scopeKey(selected.data) !== watch.scopeKey) return false;
  try { return conditionMet(watch.condition, await progressSnapshot(db, watch.startupId, selected.data)); } catch { return false; }
}
export async function watchSummary(userId: string) {
  const db = prisma as unknown as DB;
  const [watches, plans, journey, portal] = await Promise.all([
    db.investorWatch.findMany({ where: { startupId: userId, status: { not: "merged" } }, select: { investorId: true, condition: true, status: true, scopeKey: true, notifiedAt: true } }),
    db.actionPlan.findMany({ where: { userId, activeKey: userId, archivedAt: null }, select: { id: true } }),
    db.discoveryJourney.findUnique({ where: { userId }, select: { id: true } }),
    db.investorPortal.findUnique({ where: { userId }, select: { fundraisingOpenAt: true } }),
  ]);
  const workspaces = [...plans.map(p => ({ planId: p.id })), ...(journey ? [{ journeyId: journey.id }] : [])];
  const progress = await Promise.all(workspaces.map(async s => { try { return { scope: s, key: scopeKey(s), ...await progressSnapshot(db, userId, s) }; } catch { return null; } }));
  const active = watches.filter(w => ["active", "queued", "notified"].includes(w.status));
  const thresholds = progress.flatMap(p => !p ? [] : [5, 10].flatMap(n => { const matching = active.filter(w => !w.notifiedAt && w.scopeKey === p.key && w.condition === `interviews_${n}`); return matching.length ? [{ target: n, remaining: Math.max(0, n - p.interviews), investors: new Set(matching.map(w => w.investorId)).size }] : []; })).sort((a, b) => a.remaining - b.remaining);
  return { investors: new Set(active.map(w => w.investorId)).size, pending: new Set(watches.filter(w => w.status === "pending").map(w => w.investorId)).size, paused: new Set(watches.filter(w => w.status === "paused").map(w => w.investorId)).size, queued: active.filter(w => w.status === "queued").length, notified: active.filter(w => w.status === "notified").length, next: thresholds[0] || null, workspaces: progress.filter(Boolean), fundraising: Boolean(portal?.fundraisingOpenAt) };
}
export async function updateProgress(userId: string, input: { fundraising?: boolean; confirmInterviews?: z.infer<typeof scope> }) {
  if (!(await networkAccount(userId)).effectivePlan || !networkEnabled()) throw new MemberError("尚未開放 / Unavailable", 503);
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    if (input.fundraising !== undefined) {
      const { features } = await import("./access");
      if (!(await features(userId, tx)).portal) throw new MemberError("需要 NOVA / NOVA required", 403);
      await tx.investorPortal.upsert({ where: { userId }, create: { userId, fundraisingOpenAt: input.fundraising ? new Date() : null }, update: { fundraisingOpenAt: input.fundraising ? new Date() : null } });
    }
    if (input.confirmInterviews) {
      if (!input.confirmInterviews.journeyId) throw new MemberError("請使用原有任務完成入口 / Use the task completion action", 400);
      await tx.$queryRaw`SELECT "id" FROM "DiscoveryJourney" WHERE "id" = ${input.confirmInterviews.journeyId} AND "userId" = ${userId} FOR UPDATE`;
      const current = await progressSnapshot(tx, userId, input.confirmInterviews);
      if (current.interviews < current.target) throw new MemberError("尚未達到完整訪談目標 / Full interview target not met", 409);
      await tx.discoveryJourney.update({ where: { id: input.confirmInterviews.journeyId, userId }, data: { interviewsConfirmedAt: new Date() } });
    }
    await evaluateWatches(tx, userId);
    return { saved: true };
  });
}
