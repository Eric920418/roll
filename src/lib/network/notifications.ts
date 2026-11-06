import { evidenceEmailAllowed,evidenceToken } from "@/lib/evidence/reminders";
import type { EvidenceCategory } from "@/lib/evidence/reminders";
import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalEmailPayload, safeEmailError } from "@/lib/rewards/reminders";
import { MemberError } from "@/lib/member-http";
import { conditionLabel, networkEnabled, visitorCountLabel, weekDueAt, weekKey } from "./policy";
import { watchStillValid } from "./watches";
type DB = Prisma.TransactionClient;
export async function queueNotification(tx: DB, userId: string, eventKey: string, kind: string, payload: Prisma.InputJsonObject, email = false) {
  if(["invitation","message","connection_accepted"].includes(kind)) {
    const pref=await tx.evidenceWorkspace.findUnique({where:{userId}});
    const state=(await import("@/lib/evidence/schema")).evidenceStateSchema.parse(pref?.data||{});
    if(state.preferences.connection){email=true;payload={...payload,category:"connection",preferenceVersion:state.preferenceVersion};}
  }
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
export async function runNotifications(now = new Date(), budgetMs = 240000) {
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
    if (Date.now() - startedAt > budgetMs) break;
    const leaseToken = randomUUID();
    if (!(await db.memberNotificationDelivery.updateMany({ where: { id: row.id, status: { in: ["pending", "processing"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { status: "processing", leaseToken, leaseUntil: new Date(now.getTime() + 300000) } })).count) continue;
    const finish = (data: Prisma.MemberNotificationDeliveryUpdateManyMutationInput) => db.memberNotificationDelivery.updateMany({ where: { id: row.id, leaseToken, status: "processing" }, data: { ...data, leaseToken: null, leaseUntil: null } });
    try {
      if (row.attempts >= 3 || now.getTime() - row.createdAt.getTime() >= 86400000) { await finish({ status: "expired" }); continue; }
      const preferences = await db.memberNotificationPreference.upsert({ where: { userId: row.notification.userId }, create: { userId: row.notification.userId }, update: {} });
      const payload = row.notification.payload as Record<string, unknown>, watch = row.notification.kind === "watch";
      const evidence = row.notification.kind === "evidence" || ["invitation","message","connection_accepted"].includes(row.notification.kind);
      const category = (evidence ? String(payload.category || "connection") : "weekly") as EvidenceCategory;
      const evidencePreference = evidence ? await evidenceEmailAllowed(row.notification.userId,category,Number(payload.preferenceVersion)) : null;
      const eligible = async () => {
        if(evidence) {
          if(!(await evidenceEmailAllowed(row.notification.userId,category,Number(payload.preferenceVersion))).enabled)return false;
          if(category==="connection"){const connection=await db.networkConnection.findFirst({where:{id:String(payload.connectionId),OR:[{senderId:row.notification.userId},{recipientId:row.notification.userId}]}});return Boolean(connection && connection.status!=="blocked" && (row.notification.kind!=="invitation"||connection.status==="pending"));}
          if(category==="roundtable"){const registration=await db.roundtableRegistration.findFirst({where:{id:String(payload.registrationId),userId:row.notification.userId,status:"confirmed",roundtable:{status:"scheduled",startsAt:{gt:now},host:{mentorCertification:{status:"approved"}}}}});return Boolean(registration);}
          if(category==="task"){const action=await db.actionItem.findFirst({where:{id:String(payload.actionId),done:false,actionPlan:{id:String(payload.planId),userId:row.notification.userId,activeKey:row.notification.userId,archivedAt:null}}});if(!action)return false;if(payload.contactId){const saved=(await import("@/lib/action-plan/flow/catalog")).flowStoredSchema.safeParse(action.taskWorkspace).data;return Boolean(saved?.data.kind==="outreach"&&saved.data.contacts.some(c=>c.id===payload.contactId&&c.status==="sent"&&c.date===payload.contactDate));}return true;}
          return true;
        }
        const current = await db.memberNotificationPreference.findUnique({ where: { userId: row.notification.userId } });
        return current && (watch ? current.watchEmail && await watchStillValid(db, String(payload.watchId)) : current.weeklyEmail);
      };
      if (!await eligible()) { await finish({ status: "cancelled" }); continue; }
      const zh = (evidencePreference?.state.preferences.locale || preferences.locale) === "zh-tw", origin = process.env.NEXT_PUBLIC_APP_URL;
      const viewers = visitorCountLabel(payload, zh);
      if (!watch && !evidence && !viewers) { await finish({ status: "cancelled" }); continue; }
      if (!origin || new URL(origin).protocol !== "https:") throw new Error("通知需要正式 HTTPS 網址 / HTTPS app origin required");
      const token = evidence ? evidenceToken(row.notification.userId,evidencePreference!.state.preferenceVersion,category) : notificationToken(row.notification.userId, preferences.version, watch ? "watch" : "weekly");
      const optout = new URL(`${zh ? "/zh-tw" : ""}/${evidence ? "evidence" : "network"}/unsubscribe?token=${encodeURIComponent(token)}`, origin).href, oneClick = new URL(`/api/${evidence ? "evidence" : "notifications"}/unsubscribe?token=${encodeURIComponent(token)}`, origin).href;
      const genericConnection = row.notification.kind === "invitation" ? (zh ? "你有新的交流邀請" : "A new connection invitation") : row.notification.kind === "message" ? (zh ? "你有新的訊息" : "You have a new message") : (zh ? "交流邀請已接受" : "Your connection invitation was accepted");
      const title = evidence ? (row.notification.kind === "evidence" ? String(zh ? payload.titleZh : payload.titleEn) : genericConnection) : watch ? `${payload.company}: ${conditionLabel(String(payload.condition), zh)}` : zh ? `本週有 ${viewers}看了你的頁面` : `${viewers} viewed your page this week`;
      const href = new URL(`${zh ? "/zh-tw" : ""}/dashboard/${evidence ? category === "connection" ? "matchmaking?tab=messages" : category === "roundtable" ? "matchmaking?tab=roundtables" : "agenda" : "notifications"}`, origin).href;
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
