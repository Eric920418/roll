import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { COUNTRY_CODES, INDUSTRY_LABELS } from "@/lib/member-options";
import { MemberError } from "@/lib/member-http";
import { canonicalEmailPayload } from "@/lib/rewards/reminders";
import { signupNewsletter } from "@/lib/newsletter/service";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import { REPORT_ID, REPORT_NOTIFY_TO, reportFile } from "./catalog";

export const reportRequestSchema = z.object({
  requestId: z.uuid(), reportId: z.literal(REPORT_ID), name: z.string().trim().min(1).max(200),
  email: z.email().max(254).transform(v => v.toLowerCase()), company: z.string().trim().min(1).max(200),
  country: z.string().refine(v => COUNTRY_CODES.includes(v), "請選擇國家 / Select a country"),
  industry: z.string().refine(v => v === "" || Object.hasOwn(INDUSTRY_LABELS, v)),
  reportLanguage: z.enum(["en", "zh-tw"]), locale: z.enum(["en", "zh-tw"]), subscribe: z.boolean(),
  timeZone: z.string().max(100).refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }),
  website: z.string().max(200).default(""),
}).strict();
export type ReportInput = z.infer<typeof reportRequestSchema>;
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const reportsEnabled = () => process.env.REPORT_EMAIL_ENABLED === "true" && !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
function origin() {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rollon.com.tw");
  if (url.protocol !== "https:" || !["rollon.com.tw", "www.rollon.com.tw", "rollgrp.com", "www.rollgrp.com"].includes(url.hostname)) throw new MemberError("報告寄送網址設定錯誤 / Report delivery origin is unavailable", 503);
  return url.origin;
}
export function reportPayloads(input: ReportInput) {
  const zh = input.reportLanguage === "zh-tw", href = new URL(reportFile(input.reportLanguage), origin()).href;
  const address = process.env.RESEND_FROM_EMAIL!.replace(/^.*<([^>]+)>$/, "$1");
  const base = { from: `ROLL ON <${address}>`, reply_to: REPORT_NOTIFY_TO };
  const subject = zh ? "你的台灣市場進入報告｜2026 第四季" : "Your Taiwan Market Entry Report | Q4 2026";
  const text = (zh ? "感謝索取報告。附件是你選擇的繁體中文版（10 頁）。如無法開啟附件，可使用以下下載連結：" : "Thank you for requesting the report. Your selected English edition (10 pages) is attached. You can also download it here:") + "\n\n" + href;
  const notification = ["新的台灣市場報告申請", `姓名：${input.name}`, `Email：${input.email}`, `公司：${input.company}`, `國家：${input.country}`, `產業：${input.industry || "未提供"}`, `報告語言：${input.reportLanguage}`, `申請訂閱：${input.subscribe ? "是（仍須 Email 確認）" : "否"}`].join("\n");
  return [
    { kind: "report", payload: { ...base, to: [input.email], subject, text, html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;color:#741c2b"><h1>ROLL ON.</h1><h2>${escape(subject)}</h2><p>${escape(text.split("\n\n")[0])}</p><a href="${href}">${zh ? "下載報告" : "Download the report"}</a></div>`, attachments: [{ path: href, filename: `Roll-On-Taiwan-Market-Entry-Q4-2026-${input.reportLanguage}.pdf` }] } },
    { kind: "notification", payload: { ...base, to: [REPORT_NOTIFY_TO], subject: "ROLL ON｜新的台灣市場報告申請", text: notification } },
  ];
}
export async function createReportRequest(input: ReportInput) {
  if (!reportsEnabled()) throw new MemberError("報告寄送目前未開放；輸入已保留，請稍後重試 / Report delivery unavailable; input retained. Retry later", 503);
  const requestHash = createHash("sha256").update(canonicalEmailPayload(input)).digest("hex");
  const row = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"report:" + input.requestId}))`;
    const prior = await tx.marketReportRequest.findUnique({ where: { requestId: input.requestId } });
    if (prior) { if (prior.requestHash !== requestHash) throw new MemberError("請求內容已變更，請確認後重新送出 / Request content changed; review and submit again"); return prior; }
    const { website: _trap, ...data } = input;
    void _trap;
    return tx.marketReportRequest.create({ data: { ...data, requestHash, newsletterStatus: input.subscribe ? "pending" : "not_requested", deliveries: { create: reportPayloads(input).map(job => ({ ...job, payload: job.payload as Prisma.InputJsonValue })) } } });
  });
  let newsletterStatus = row.newsletterStatus, newsletterError = row.newsletterError;
  if (row.subscribe && ["pending", "failed"].includes(newsletterStatus)) {
    try {
      // A real company is not the newsletter's honeypot; only explicit opt-ins reach this service.
      await signupNewsletter({ email: row.email, locale: input.locale, consent: true, timeZone: input.timeZone, company: "" });
      const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { email: row.email }, select: { status: true } });
      newsletterStatus = subscriber?.status === "active" ? "active" : "queued"; newsletterError = null;
    } catch (e) { newsletterStatus = "failed"; newsletterError = e instanceof MemberError ? e.message : publicErrorMessage(logSecurityError("report.newsletter", e)); }
    await prisma.marketReportRequest.update({ where: { id: row.id }, data: { newsletterStatus, newsletterError } });
  }
  await runReportDeliveries(new Date(), 40000, row.id);
  const jobs = await prisma.marketReportDelivery.findMany({ where: { requestId: row.id }, select: { kind: true, status: true, lastError: true } });
  const report = jobs.find(v => v.kind === "report");
  return { received: true, delivery: report?.status || "pending", deliveryError: report?.lastError ?? null, newsletterStatus, newsletterError };
}
export async function runReportDeliveries(now = new Date(), budgetMs = 60000, requestId?: string) {
  if (!reportsEnabled()) return { disabled: true, accepted: 0, failed: 0 };
  if (budgetMs <= 0) return { disabled: false, accepted: 0, failed: 0 };
  const started = Date.now(), jobs = await prisma.marketReportDelivery.findMany({ where: { status: { in: ["pending", "processing"] }, nextAttemptAt: { lte: now }, ...(requestId ? { requestId } : {}) }, orderBy: { createdAt: "asc" }, take: 30 });
  let accepted = 0, failed = 0;
  for (const row of jobs) {
    if (Date.now() - started > budgetMs) break;
    const leaseToken = randomUUID();
    const claim = await prisma.marketReportDelivery.updateMany({ where: { id: row.id, status: { in: ["pending", "processing"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseToken, leaseUntil: new Date(now.getTime() + 300000), status: "processing" } });
    if (!claim.count) continue;
    const finish = (data: Prisma.MarketReportDeliveryUpdateManyMutationInput) => prisma.marketReportDelivery.updateMany({ where: { id: row.id, leaseToken, status: "processing" }, data: { ...data, leaseToken: null, leaseUntil: null } });
    if (row.attempts >= 3 || now.getTime() - row.createdAt.getTime() >= 86400000) { await finish({ status: "failed", lastError: "補寄期限或嘗試次數已達上限 / Retry window or attempt limit reached" }); failed++; continue; }
    try {
      await prisma.marketReportDelivery.updateMany({ where: { id: row.id, leaseToken }, data: { attempts: { increment: 1 } } });
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": "rollon-report:" + row.id }, body: canonicalEmailPayload(row.payload), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
      const body = await response.json();
      if (typeof body.id !== "string") throw new Error("Resend response missing receipt");
      await finish({ status: "accepted", providerId: body.id, acceptedAt: new Date(), lastError: null }); accepted++;
    } catch (e) {
      const detail = e instanceof Error && /^Resend (HTTP \d{3}|response missing receipt)$/.test(e.message) ? e.message : "寄信服務逾時或無法連線 / Email service timeout or connection failure";
      await finish({ status: row.attempts + 1 >= 3 ? "failed" : "pending", lastError: detail, nextAttemptAt: new Date(now.getTime() + 15 * 60000) }); failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 550));
  }
  return { disabled: false, accepted, failed };
}
