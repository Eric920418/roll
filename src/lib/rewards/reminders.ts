import { logSecurityError } from "@/lib/security/log";
import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBetaAccess } from "@/lib/auth/account";
import { toPlanKey } from "@/lib/billing/plans";
import { getEffectivePlan } from "@/lib/billing/gate";
import { rewardKeys, nextReminderAt, validReminderTime, validTimeZone } from "./policy";
import { rewardTransaction, rewardOpportunities, RewardError } from "./service";

export const reminderSchema = z.object({ enabled: z.boolean(), time: z.string().refine(validReminderTime, "時間必須為每 15 分鐘的選項 / Select a 15-minute time slot"), timeZone: z.string().max(100).refine(validTimeZone, "無效時區 / Invalid time zone"), locale: z.enum(["en", "zh-tw"]) }).strict();
export function rewardEmailConfigured() { return process.env.REWARD_EMAIL_ENABLED === "true" && Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.CRON_SECRET && process.env.AUTH_SECRET && process.env.NEXT_PUBLIC_APP_URL); }
export async function saveReminder(userId: string, input: z.infer<typeof reminderSchema>, now = new Date()) {
  if (input.enabled && !rewardEmailConfigured()) throw new RewardError("Email 提醒尚未開放，請稍後再啟用 / Email reminders are not available yet", 503, "email_unavailable");
  await rewardTransaction(async tx => {
    const previous = await tx.rewardReminder.findUnique({ where: { userId } });
    if (previous?.enabled && !input.enabled) await tx.rewardEntry.createMany({ data: [{ userId, eventKey: `unsubscribe:${previous.tokenVersion}`, kind: "unsubscribe", points: 0, dayKey: rewardKeys(now).day }], skipDuplicates: true });
    await tx.rewardDelivery.updateMany({ where: { userId, status: { in: ["pending", "processing"] } }, data: { status: "cancelled", leaseToken: null, leaseUntil: null } });
    const data = { ...input, tokenVersion: randomUUID(), nextSendAt: input.enabled ? nextReminderAt(input.time, input.timeZone, now) : null };
    await tx.rewardReminder.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  });
}
function signature(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new RewardError("提醒簽章設定缺失 / Reminder signing configuration missing", 503, "email_unavailable");
  return createHmac("sha256", secret).update(`reward-unsubscribe:${value}`).digest("hex");
}
export function unsubscribeToken(userId: string, version: string) {
  const value = `${userId}.${version}`;
  return `${value}.${signature(value)}`;
}
export function readUnsubscribeToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^[a-zA-Z0-9_-]{1,100}$/.test(parts[0]) || !/^[a-f0-9-]{36}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) throw new RewardError("退訂連結無效 / Invalid unsubscribe link", 400, "invalid_token");
  const value = `${parts[0]}.${parts[1]}`;
  if (!timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(signature(value), "hex"))) throw new RewardError("退訂連結無效 / Invalid unsubscribe link", 400, "invalid_token");
  return { userId: parts[0], tokenVersion: parts[1] };
}
export async function unsubscribeReminder(token: string) {
  const where = readUnsubscribeToken(token);
  await rewardTransaction(async tx => {
    const reminder = await tx.rewardReminder.findFirst({ where });
    if (!reminder) throw new RewardError("退訂連結已失效，請使用最新郵件或帳號設定 / Link expired; use the latest email or account settings", 400, "expired_token");
    await tx.rewardEntry.createMany({ data: [{ userId: where.userId, eventKey: `unsubscribe:${where.tokenVersion}`, kind: "unsubscribe", points: 0, dayKey: rewardKeys().day }], skipDuplicates: true });
    await tx.rewardReminder.update({ where: { userId: where.userId }, data: { enabled: false, nextSendAt: null } });
    await tx.rewardDelivery.updateMany({ where: { userId: where.userId, status: { in: ["pending", "processing"] } }, data: { status: "cancelled", leaseToken: null, leaseUntil: null } });
  });
}
function escape(value: string) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
export function emailPayload(to: string, userId: string, version: string, locale: string, kind: "profile" | "quiz" | "action", href: string, points: number) {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!);
  if (origin.protocol !== "https:" && process.env.NODE_ENV === "production") throw new RewardError("正式提醒需要 HTTPS 網址 / HTTPS app URL required", 503);
  const token = unsubscribeToken(userId, version), zh = locale === "zh-tw", prefix = zh ? "/zh-tw" : "";
  const cta = new URL(`${prefix}${href}`, origin).href;
  const unsubscribe = new URL(`${prefix}/rewards/unsubscribe?token=${encodeURIComponent(token)}`, origin).href;
  const oneClick = new URL(`/api/rewards/unsubscribe?token=${encodeURIComponent(token)}`, origin).href;
  const label = zh ? { profile: "完善公司資料", quiz: "完成本期知識測驗", action: "完成下一項行動" }[kind] : { profile: "Complete your company profile", quiz: "Complete this period’s quiz", action: "Complete your next action" }[kind];
  const subject = zh ? "NOVA AI：今天的一小步，累積下一個獎勵" : "NOVA AI: one useful step towards your next reward";
  const text = `${label} · +${points} ${zh ? "積分" : "points"}\n${cta}\n${zh ? "退訂每日提醒" : "Unsubscribe from daily reminders"}: ${unsubscribe}`;
  return {
    from: process.env.RESEND_FROM_EMAIL!, to: [to], subject, text,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;color:#111;background:#fff;padding:32px"><img src="${escape(new URL("/nova/logo-metal.png", origin).href)}" width="240" height="46" alt="NOVA AI" style="display:block;width:240px;max-width:100%;height:auto;margin-bottom:28px" /><h1>${escape(label)}</h1><p>+${points} ${zh ? "積分，每一步都算數。" : "points. Every useful step counts."}</p><p><a style="display:inline-block;background:#000;color:white;padding:14px 24px;border-radius:12px" href="${escape(cta)}">${zh ? "回到 NOVA AI" : "Return to NOVA AI"}</a></p><hr><a href="${escape(unsubscribe)}">${zh ? "退訂每日提醒" : "Unsubscribe from daily reminders"}</a></div>`,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
export function safeEmailError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of ["RESEND_API_KEY", "AUTH_SECRET", "CRON_SECRET", "DATABASE_URL"]) {
    const value = process.env[key]; if (value) message = message.split(value).join("[redacted]");
  }
  return message.replace(/re_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 2000);
}
// PostgreSQL JSONB changes object key order. Canonicalize every attempt so provider
// idempotency receives identical bytes, including retries loaded from the outbox.
export function canonicalEmailPayload(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : item;
  return JSON.stringify(canonical(value));
}
export async function runRewardReminders(now = new Date()) {
  if (!rewardEmailConfigured()) return { disabled: true, accepted: 0, skipped: 0, failed: 0 };
  const startedAt = Date.now();
  const scheduled = await prisma.rewardReminder.findMany({ where: { enabled: true, nextSendAt: { lte: now } }, orderBy: { nextSendAt: "asc" }, take: 100 });
  for (const reminder of scheduled) {
    await rewardTransaction(async tx => {
      const moved = await tx.rewardReminder.updateMany({ where: { userId: reminder.userId, enabled: true, nextSendAt: reminder.nextSendAt, tokenVersion: reminder.tokenVersion }, data: { nextSendAt: nextReminderAt(reminder.time, reminder.timeZone, now) } });
      if (!moved.count) return;
      const scheduledAt = reminder.nextSendAt!;
      await tx.rewardDelivery.createMany({ data: [{ userId: reminder.userId, dayKey: rewardKeys(scheduledAt).day, scheduledAt, reminderVersion: reminder.tokenVersion, nextAttemptAt: now }], skipDuplicates: true });
    });
  }
  const due = await prisma.rewardDelivery.findMany({ where: { status: { in: ["pending", "processing"] }, nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, orderBy: { nextAttemptAt: "asc" }, take: 100 });
  const result = { disabled: false, accepted: 0, skipped: 0, failed: 0 };
  const betaAccess = await getBetaAccess();
  for (const delivery of due) {
    if (Date.now() - startedAt > 250000) break;
    const leaseToken = randomUUID();
    const claimed = await prisma.rewardDelivery.updateMany({ where: { id: delivery.id, status: { in: ["pending", "processing"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { status: "processing", leaseToken, leaseUntil: new Date(now.getTime() + 5 * 60000) } });
    if (!claimed.count) continue;
    const finish = (data: Parameters<typeof prisma.rewardDelivery.updateMany>[0]["data"]) => prisma.rewardDelivery.updateMany({ where: { id: delivery.id, leaseToken, status: "processing" }, data: { ...data, leaseToken: null, leaseUntil: null } });
    try {
      if (delivery.attempts >= 3 || now.getTime() - delivery.scheduledAt.getTime() > 2 * 3600000 || delivery.dayKey !== rewardKeys(now).day) {
        await finish({ status: "expired" }); result.skipped++; continue;
      }
      const [user, reminder, completed] = await Promise.all([
        prisma.user.findUnique({ where: { id: delivery.userId }, include: { profile: true } }),
        prisma.rewardReminder.findUnique({ where: { userId: delivery.userId } }),
        prisma.rewardEntry.count({ where: { userId: delivery.userId, dayKey: delivery.dayKey, kind: { in: ["action", "quiz", "profile"] }, points: { gt: 0 } } }),
      ]);
      if (!user || !reminder?.enabled || completed || reminder.tokenVersion !== delivery.reminderVersion) {
        await finish({ status: "skipped" }); result.skipped++; continue;
      }
      const { opportunities } = await rewardOpportunities(user.id, getEffectivePlan({ ...user, plan: toPlanKey(user.plan), trialPlan: user.trialPlan ? toPlanKey(user.trialPlan) : null, betaAccess }) !== "free", user.createdAt, user.profile, now);
      const opportunity = opportunities[0];
      if (!opportunity) { await finish({ status: "skipped" }); result.skipped++; continue; }
      const payload = delivery.payload ?? emailPayload(user.email, user.id, reminder.tokenVersion, reminder.locale, opportunity.kind, opportunity.href, opportunity.points);
      // A queued quiz predates removal of quiz recommendations. Do not replace an
      // idempotent provider payload with different bytes or send obsolete guidance.
      if (delivery.payload && JSON.stringify(delivery.payload).includes("/dashboard/quiz")) { await finish({ status: "skipped" }); result.skipped++; continue; }
      // Persist the exact payload before calling Resend so retries use the same idempotent request.
      const counted = await prisma.rewardDelivery.updateMany({ where: { id: delivery.id, leaseToken, status: "processing" }, data: { payload, attempts: { increment: 1 } } });
      if (!counted.count) continue;
      await new Promise(resolve => setTimeout(resolve, 550));
      const [stillEnabled, completedBeforeSend, currentOpportunities] = await Promise.all([
        prisma.rewardReminder.findFirst({ where: { userId: user.id, enabled: true, tokenVersion: reminder.tokenVersion } }),
        prisma.rewardEntry.count({ where: { userId: user.id, dayKey: delivery.dayKey, kind: { in: ["action", "quiz", "profile"] }, points: { gt: 0 } } }),
        rewardOpportunities(user.id, getEffectivePlan({ ...user, plan: toPlanKey(user.plan), trialPlan: user.trialPlan ? toPlanKey(user.trialPlan) : null, betaAccess }) !== "free", user.createdAt, user.profile, now),
      ]);
      if (!stillEnabled) { await finish({ status: "cancelled" }); continue; }
      if (completedBeforeSend || !currentOpportunities.opportunities.some(item => item.kind === opportunity.kind)) {
        await finish({ status: "skipped" }); result.skipped++; continue;
      }
      const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `nova-reward:${delivery.id}` }, body: canonicalEmailPayload(payload), signal: AbortSignal.timeout(20000) });
      const raw = await res.text();
      if (!res.ok) {
        let detail = ""; try { const parsed = JSON.parse(raw); detail = String(parsed.message ?? parsed.name ?? ""); } catch { detail = "Invalid provider response"; }
        throw new Error(`Resend HTTP ${res.status}: ${detail}`);
      }
      const response = JSON.parse(raw) as { id?: string };
      if (!response.id) throw new Error("Resend 未回傳寄送識別碼 / Missing Resend message ID");
      await finish({ status: "accepted", providerId: response.id, acceptedAt: new Date(), lastError: null }); result.accepted++;
    } catch (error) {
      logSecurityError("reward_reminder.delivery_failed", error);
      // Read the committed count: pre-provider failures also consume an attempt.
      const current = await prisma.rewardDelivery.findUnique({ where: { id: delivery.id }, select: { attempts: true } });
      const attempts = Math.max(delivery.attempts + 1, current?.attempts ?? 0);
      await finish({ status: attempts >= 3 ? "failed" : "pending", attempts, lastError: safeEmailError(error), nextAttemptAt: new Date(now.getTime() + (attempts === 1 ? 15 : 30) * 60000) }); result.failed++;
    }
  }
  return result;
}
