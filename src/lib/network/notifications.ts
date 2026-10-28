import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalEmailPayload, safeEmailError } from "@/lib/rewards/reminders";
import { MemberError } from "@/lib/member-http";
import { conditionLabel, networkEnabled, weekDueAt, weekKey } from "./policy";
import { watchStillValid } from "./watches";
type DB = Prisma.TransactionClient;
export async function queueNotification(tx: DB, userId: string, eventKey: string, kind: string, payload: Prisma.InputJsonObject, email = false) {
  const row = await tx.memberNotification.upsert({ where: { eventKey }, create: { userId, eventKey, kind, payload }, update: {} });
  if (email) await tx.memberNotificationDelivery.upsert({ where: { notificationId: row.id }, create: { notificationId: row.id }, update: {} });
  return row;
}
export async function notificationList(userId: string) {
  const [rows, unread, preferences] = await Promise.all([
    prisma.memberNotification.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, include: { delivery: { select: { status: true, acceptedAt: true, lastError: true } } } }),
    prisma.memberNotification.count({ where: { userId, readAt: null } }),
    prisma.memberNotificationPreference.findUnique({ where: { userId } }),
  ]);
  return { notifications: await Promise.all(rows.map(async row => {
    const payload = row.payload as Record<string, unknown>;
    const visible = row.kind !== "watch" || await watchStillValid(prisma as unknown as DB, String(payload.watchId));
    return { id: row.id, kind: visible ? row.kind : "unavailable", payload: visible ? payload : {}, readAt: row.readAt, createdAt: row.createdAt, delivery: row.delivery };
  })), unread, preferences: preferences ? { weeklyEmail: preferences.weeklyEmail, watchEmail: preferences.watchEmail, locale: preferences.locale } : { weeklyEmail: true, watchEmail: true, locale: "en" } };
}
function sign(value: string) {
  if (!process.env.AUTH_SECRET) throw new MemberError("通知簽章設定缺失 / Notification signing unavailable", 503);
  return createHmac("sha256", process.env.AUTH_SECRET).update(`network-email:${value}`).digest("hex");
}
export function notificationToken(userId: string, version: string, category: "weekly" | "watch") { const value = `${userId}.${version}.${category}`; return `${value}.${sign(value)}`; }
export function readNotificationToken(token: string) {
  const [userId, version, category, signature, extra] = token.split(".");
  if (extra || !/^[A-Za-z0-9_-]{1,100}$/.test(userId || "") || !/^[a-f0-9-]{36}$/.test(version || "") || !["weekly", "watch"].includes(category || "") || !/^[a-f0-9]{64}$/.test(signature || "")) throw new MemberError("退訂連結無效 / Invalid unsubscribe link", 400);
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(`${userId}.${version}.${category}`), "hex"))) throw new MemberError("退訂連結無效 / Invalid unsubscribe link", 400);
  return { userId, version, category };
}
export async function unsubscribe(token: string) {
  const value = readNotificationToken(token);
  const result = await prisma.memberNotificationPreference.updateMany({ where: { userId: value.userId, version: value.version }, data: value.category === "weekly" ? { weeklyEmail: false } : { watchEmail: false } });
  if (!result.count) throw new MemberError("退訂連結已失效 / Unsubscribe link expired", 400);
  return { saved: true };
}
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function runNotifications(now = new Date()) {
  const db = prisma as unknown as DB;
  if (!networkEnabled()) return { disabled: true, accepted: 0, failed: 0 };
  const previousWeek = weekKey(new Date(now.getTime() - 7 * 86400000));
  if (now >= weekDueAt(previousWeek) && !await db.setting.findUnique({ where: { key: `member_digest:${previousWeek}` } })) {
    const groups = await db.memberVisit.groupBy({ by: ["ownerId", "role"], where: { week: previousWeek }, _count: true });
    for (const ownerId of new Set(groups.map(g => g.ownerId))) {
      const value = (role: string) => groups.find(g => g.ownerId === ownerId && g.role === role)?._count || 0;
      await queueNotification(db, ownerId, `visits:${ownerId}:${previousWeek}`, "weekly", { week: previousWeek, investors: value("investor"), founders: value("founder"), others: value("other") }, true);
    }
    await db.setting.upsert({ where: { key: `member_digest:${previousWeek}` }, create: { key: `member_digest:${previousWeek}`, value: "complete" }, update: {} });
  }
  const testMode = process.env.MEMBER_NETWORK_EMAIL_ENABLED === "test";
  const testUser = process.env.MEMBER_NETWORK_EMAIL_TEST_USER_ID, testTo = process.env.MEMBER_NETWORK_EMAIL_TEST_TO;
  if (testMode && (!testUser || !testTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo))) return { disabled: true, accepted: 0, failed: 0 };
  if ((!testMode && process.env.MEMBER_NETWORK_EMAIL_ENABLED !== "true") || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { disabled: true, accepted: 0, failed: 0 };
  const due = await db.memberNotificationDelivery.findMany({ where: { ...(testMode ? { notification: { userId: testUser } } : {}), status: { in: ["pending", "processing"] }, nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: 50, include: { notification: { include: { user: { select: { email: true } } } } } });
  let accepted = 0, failed = 0; const startedAt = Date.now();
  for (const row of due) {
    if (Date.now() - startedAt > 240000) break;
    const leaseToken = randomUUID();
    if (!(await db.memberNotificationDelivery.updateMany({ where: { id: row.id, status: { in: ["pending", "processing"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { status: "processing", leaseToken, leaseUntil: new Date(now.getTime() + 300000) } })).count) continue;
    const finish = (data: Prisma.MemberNotificationDeliveryUpdateManyMutationInput) => db.memberNotificationDelivery.updateMany({ where: { id: row.id, leaseToken, status: "processing" }, data: { ...data, leaseToken: null, leaseUntil: null } });
    try {
      if (row.attempts >= 3 || now.getTime() - row.createdAt.getTime() >= 86400000) { await finish({ status: "expired" }); continue; }
      const preferences = await db.memberNotificationPreference.upsert({ where: { userId: row.notification.userId }, create: { userId: row.notification.userId }, update: {} });
      const payload = row.notification.payload as Record<string, unknown>, watch = row.notification.kind === "watch";
      const eligible = async () => {
        const current = await db.memberNotificationPreference.findUnique({ where: { userId: row.notification.userId } });
        return current && (watch ? current.watchEmail && await watchStillValid(db, String(payload.watchId)) : current.weeklyEmail);
      };
      if (!await eligible()) { await finish({ status: "cancelled" }); continue; }
      const zh = preferences.locale === "zh-tw", origin = process.env.NEXT_PUBLIC_APP_URL;
      if (!origin || new URL(origin).protocol !== "https:") throw new Error("通知需要正式 HTTPS 網址 / HTTPS app origin required");
      const token = notificationToken(row.notification.userId, preferences.version, watch ? "watch" : "weekly");
      const optout = new URL(`${zh ? "/zh-tw" : ""}/network/unsubscribe?token=${encodeURIComponent(token)}`, origin).href, oneClick = new URL(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`, origin).href;
      const title = watch ? `${payload.company}: ${conditionLabel(String(payload.condition), zh)}` : zh ? `本週有 ${payload.investors} 位投資人、${payload.founders} 位創辦人、${payload.others} 位其他會員看了你的頁面` : `${payload.investors} investors, ${payload.founders} founders and ${payload.others} other members viewed your page this week`;
      const href = new URL(`${zh ? "/zh-tw" : ""}/dashboard/notifications`, origin).href;
      const draftEmail = { from: process.env.RESEND_FROM_EMAIL, to: [row.notification.user.email], subject: `NOVA: ${title}`, text: `${title}\n${href}\nUnsubscribe: ${optout}`, html: `<div style="font-family:sans-serif;max-width:560px;margin:auto"><img alt="NOVA" width="240" src="${escape(new URL("/nova/logo-metal.png", origin).href)}"/><h1>${escape(title)}</h1><p><a href="${escape(href)}">${zh ? "查看 NOVA" : "Open NOVA"}</a></p><a href="${escape(optout)}">${zh ? "退訂此類通知" : "Unsubscribe"}</a></div>`, headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
      const email = row.payload || (testMode ? { ...draftEmail, to: [testTo!], subject: `[NOVA TEST] ${draftEmail.subject}` } : draftEmail);
      if (testMode && JSON.stringify((email as typeof draftEmail).to) !== JSON.stringify([testTo])) { await finish({ status: "cancelled", lastError: "Test recipient changed; cancelled" }); continue; }
      await db.memberNotificationDelivery.updateMany({ where: { id: row.id, leaseToken }, data: { payload: email as Prisma.InputJsonValue, attempts: { increment: 1 } } });
      if (!await eligible()) { await finish({ status: "cancelled" }); continue; }
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `nova-network:${row.id}` }, body: canonicalEmailPayload(email), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(`Resend HTTP ${response.status}`);
      await finish({ status: "accepted", providerId: result.id, acceptedAt: new Date(), lastError: null }); accepted++;
      if (watch) await db.investorWatch.updateMany({ where: { id: String(payload.watchId), status: "queued" }, data: { status: "notified" } });
      await new Promise(resolve => setTimeout(resolve, 550));
    } catch (error) { failed++; await finish({ status: row.attempts + 1 >= 3 ? "failed" : "pending", attempts: row.attempts + 1, lastError: safeEmailError(error), nextAttemptAt: new Date(now.getTime() + (row.attempts ? 30 : 15) * 60000) }); }
  }
  return { disabled: false, accepted, failed };
}
