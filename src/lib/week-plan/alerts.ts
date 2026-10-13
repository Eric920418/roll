import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getBetaAccess } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { toPlanKey } from "@/lib/billing/plans";
import { getActiveActionPlan } from "@/lib/action-plan/service";
import { rewardEmailConfigured, canonicalEmailPayload, safeEmailError } from "@/lib/rewards/reminders";
import { RewardError } from "@/lib/rewards/service";
import { logSecurityError } from "@/lib/security/log";

function signature(value: string) {
  if (!process.env.AUTH_SECRET) throw new RewardError("提醒設定缺失 / Reminder configuration missing", 503);
  return createHmac("sha256", process.env.AUTH_SECRET).update(`nova-task-unsubscribe:${value}`).digest("hex");
}
export function taskUnsubscribeToken(userId: string, version: string) { const value = `${userId}.${version}`; return `${value}.${signature(value)}`; }
export function readTaskUnsubscribeToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[a-zA-Z0-9_-]{1,100}$/.test(parts[0]) || !/^[a-f0-9-]{36}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2]) || !timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(signature(`${parts[0]}.${parts[1]}`), "hex"))) throw new RewardError("退訂連結無效 / Invalid unsubscribe link", 400, "invalid_token");
  return parts[0];
}
export async function unsubscribeTaskAlerts(token: string) {
  const userId = readTaskUnsubscribeToken(token);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`nova-week:${userId}`}, 0))::text AS locked`;
    if (!await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new RewardError("退訂連結已失效 / Unsubscribe link expired", 400);
    await tx.weekCalendarItem.updateMany({ where: { userId, alertAt: { not: null } }, data: { alertAt: null, alertVersion: null, revision: { increment: 1 } } });
    await tx.calendarTaskAlert.updateMany({ where: { userId, status: { in: ["pending", "processing"] } }, data: { status: "cancelled", leaseToken: null, leaseUntil: null } });
  });
}
export function taskAlertPayload(to: string, userId: string, version: string, startsAt: Date, locale: string) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!);
  if (origin.protocol !== "https:" && process.env.NODE_ENV === "production") throw new RewardError("正式提醒需要 HTTPS / HTTPS required", 503);
  const zh = locale === "zh-tw", prefix = zh ? "/zh-tw" : "", token = taskUnsubscribeToken(userId, version);
  const cta = new URL(`${prefix}/dashboard#this-week`, origin).href;
  const unsubscribe = new URL(`${prefix}/tasks/unsubscribe?token=${encodeURIComponent(token)}`, origin).href;
  const oneClick = new URL(`/api/week-plan/alerts/unsubscribe?token=${encodeURIComponent(token)}`, origin).href;
  const time = new Intl.DateTimeFormat(zh ? "zh-TW" : "en", { timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short" }).format(startsAt);
  const subject = zh ? "NOVA：你的任務即將開始" : "NOVA: your scheduled task starts soon";
  const detail = `${time} · Asia/Taipei`;
  return { from: process.env.RESEND_FROM_EMAIL!, to: [to], subject,
    text: `${subject}\n${detail}\n${cta}\n${zh ? "關閉任務 Email 提醒" : "Turn off task email alerts"}: ${unsubscribe}`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;color:#111"><img src="${new URL("/nova/logo-metal.png", origin).href}" width="240" alt="NOVA" /><h1>${subject}</h1><p>${detail}</p><p><a href="${cta}">${zh ? "查看今天的任務" : "View your tasks"}</a></p><hr /><a href="${unsubscribe}">${zh ? "關閉任務 Email 提醒" : "Turn off task email alerts"}</a></div>`,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
export async function runTaskAlerts(now = new Date()) {
  const result = { accepted: 0, skipped: 0, failed: 0 };
  if (!rewardEmailConfigured()) return result;
  const betaAccess = await getBetaAccess(), started = Date.now();
  const due = await prisma.calendarTaskAlert.findMany({ where: { status: { in: ["pending", "processing"] }, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: { nextAttemptAt: "asc" }, take: 50 });
  for (const delivery of due) {
    if (Date.now() - started > 60000) break;
    const leaseToken = randomUUID();
    const claimed = await prisma.calendarTaskAlert.updateMany({ where: { id: delivery.id, status: { in: ["pending", "processing"] }, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { status: "processing", leaseToken, leaseUntil: new Date(now.getTime() + 5 * 60000) } });
    if (!claimed.count) continue;
    const finish = (data: Parameters<typeof prisma.calendarTaskAlert.updateMany>[0]["data"]) => prisma.calendarTaskAlert.updateMany({ where: { id: delivery.id, status: "processing", leaseToken }, data: { ...data, leaseToken: null, leaseUntil: null } });
    const eligible = async () => {
      const entry = await prisma.weekCalendarItem.findUnique({ where: { id: delivery.calendarItemId }, include: { user: true } });
      if (!entry || entry.deletedAt || entry.done || !entry.alertAt || entry.alertVersion !== delivery.version || !entry.startsAt || entry.startsAt.getTime() <= now.getTime() + Math.max(0, Date.now() - started)) return null;
      if (entry.kind === "action") {
        const plan = getEffectivePlan({ ...entry.user, plan: toPlanKey(entry.user.plan), trialPlan: entry.user.trialPlan ? toPlanKey(entry.user.trialPlan) : null, betaAccess });
        if (plan === "free") return null;
        const action = (await getActiveActionPlan(entry.userId))?.actions.find(a => a.id === entry.actionId);
        if (!action || action.done || action.dependency.blocked) return null;
      }
      return entry;
    };
    try {
      if (delivery.attempts >= 3 || now.getTime() - delivery.scheduledAt.getTime() > 2 * 3600000) { await finish({ status: "expired" }); result.skipped++; continue; }
      const entry = await eligible();
      if (!entry) { await finish({ status: "skipped" }); result.skipped++; continue; }
      const payload = delivery.payload ?? taskAlertPayload(entry.user.email, entry.userId, delivery.version, entry.startsAt!, entry.alertLocale ?? "en");
      const counted = await prisma.calendarTaskAlert.updateMany({ where: { id: delivery.id, status: "processing", leaseToken }, data: { payload, attempts: { increment: 1 } } });
      if (!counted.count) continue;
      await new Promise(resolve => setTimeout(resolve, 550));
      const fresh = await eligible();
      const recipient = (payload as { to?: string[] }).to?.[0];
      const stillClaimed = await prisma.calendarTaskAlert.count({ where: { id: delivery.id, status: "processing", leaseToken } });
      if (!fresh || fresh.user.email !== recipient || !stillClaimed) { await finish({ status: "cancelled" }); result.skipped++; continue; }
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `nova-task:${delivery.id}` }, body: canonicalEmailPayload(payload), signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      if (!response.ok || typeof body.id !== "string" || !body.id) throw new Error(`Resend HTTP ${response.status}: ${String(body.message ?? "Missing message ID")}`);
      await finish({ status: "accepted", providerId: body.id, acceptedAt: new Date(), lastError: null }); result.accepted++;
    } catch (error) {
      logSecurityError("task_alert.delivery_failed", error);
      const current = await prisma.calendarTaskAlert.findUnique({ where: { id: delivery.id }, select: { attempts: true } });
      const attempts = Math.max(delivery.attempts + 1, current?.attempts ?? 0);
      await finish({ status: attempts >= 3 ? "failed" : "pending", attempts, lastError: safeEmailError(error), nextAttemptAt: new Date(now.getTime() + 15 * 60000) }); result.failed++;
    }
  }
  return result;
}
