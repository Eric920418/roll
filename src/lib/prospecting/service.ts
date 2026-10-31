import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type ProspectingOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/network/access";
import { DISCOVERY_POLICY, discoveryTrialActive, discoveryEvidence } from "@/lib/discovery/policy";
import { readIcp } from "@/lib/icp/schema";
import { configured } from "./client";
import { activeOrderStatuses, audienceDescription, orderInputSchema, ProspectingError, publicProspectSchema, uniqueProspects, utcPeriod } from "./schema";
import type { z } from "zod";
type DB = Prisma.TransactionClient;
export const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const json = (value: unknown) => value as Prisma.InputJsonValue;
export async function lockMember(tx: DB, userId: string) {
  const found = await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE` as unknown[];
  if (!found.length) throw new ProspectingError("請重新登入 / Please sign in", 401, "unauthorized");
}
export async function eligibility(userId: string, tx: DB = prisma as unknown as DB) {
  const [rights, user, grant, journey] = await Promise.all([features(userId, tx), tx.user.findUnique({ where: { id: userId } }), tx.prospectingTrialGrant.findUnique({ where: { userId } }), tx.discoveryJourney.findUnique({ where: { userId } })]);
  let interviews = 0;
  if (journey) interviews = discoveryEvidence(journey.id, await tx.meetingNote.findMany({ where: { userId, insight: { not: Prisma.DbNull } }, select: { id: true, insight: true, updatedAt: true } })).length;
  const activeTrial = Boolean(user?.trialPlan && user.trialPolicy === DISCOVERY_POLICY && discoveryTrialActive(user));
  const poc = !rights.prospects && activeTrial && !grant && interviews >= 3;
  return { canSearch: rights.prospects || poc, fullAccess: rights.prospects, poc, activeTrial, interviews, claimed: Boolean(grant) };
}
export async function exclusions(userId: string, tx: DB = prisma as unknown as DB) {
  const [profile, notes, contacts, deals] = await Promise.all([
    tx.onboardingProfile.findUnique({ where: { userId } }), tx.meetingNote.findMany({ where: { userId }, select: { insight: true } }),
    tx.contact.findMany({ where: { userId }, select: { company: true, notes: true } }), tx.deal.findMany({ where: { userId }, select: { title: true, validation: true } }),
  ]);
  const names = [profile?.companyName || "", profile?.website || "", ...notes.map(n => (n.insight as { company?: unknown } | null)?.company).filter((v): v is string => typeof v === "string"), ...contacts.flatMap(c => [c.company || "", ...(c.notes?.startsWith("Omrade public source: ") ? [c.notes.match(/\nCompany: (https:\/\/\S+)/)?.[1] || ""] : [])]), ...deals.flatMap(d => {
    const v = d.validation as { company?: unknown; prospect?: { name?: unknown; aliases?: unknown; website?: unknown } } | null;
    return [d.title, v?.company, v?.prospect?.name, v?.prospect?.website, ...(Array.isArray(v?.prospect?.aliases) ? v.prospect.aliases : [])].filter((s): s is string => typeof s === "string");
  })].filter(Boolean);
  const domains = [...new Set(names.flatMap(value => { try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? [u.hostname.toLowerCase().replace(/^www\./, "")] : []; } catch { return []; } }))].sort();
  if (domains.length > 1000) throw new ProspectingError("排除網域超過供應商上限，請聯絡管理員 / Too many excluded domains; contact administrator", 409, "exclusion_limit");
  return { profile, names: [...new Set(names)], domains };
}
export function storedCompanies(order: Pick<ProspectingOrder, "result">) {
  const parsed = publicProspectSchema.array().safeParse(order.result); return parsed.success ? parsed.data : [];
}
export function orderView(order: ProspectingOrder, excluded: string[], workspace?: { country: string; description: string } | null) {
  const companies = uniqueProspects(storedCompanies(order), excluded);
  return { id: order.id, submissionId: order.requestId, country: order.country, description: order.description, requested: order.count, delivered: order.deliveredCount, usable: companies.length, status: order.status, poc: order.poc, period: order.period,
    createdAt: order.createdAt.toISOString(), checkedAt: order.checkedAt?.toISOString() || null, nextAttemptAt: order.nextAttemptAt.toISOString(),
    needsRecheck: !order.checkedAt || Date.now() - order.checkedAt.getTime() >= 86400000,
    stale: !order.checkedAt || Date.now() - order.checkedAt.getTime() >= 86400000 || Boolean(workspace && (workspace.country !== order.country || workspace.description !== order.description)),
    companies, rejections: order.rejections, error: order.failureMessage, code: order.failureCode, requestId: order.providerRequestId };
}
export async function prospectSnapshot(userId: string, cursor?: string) {
  if (cursor && !await prisma.prospectingOrder.findFirst({ where: { id: cursor, userId }, select: { id: true } })) throw new ProspectingError("找不到名單頁次 / Invalid history cursor", 400, "invalid_cursor");
  const [workspace, rights, context, orders, pending, usage] = await Promise.all([
    prisma.prospectingWorkspace.findUnique({ where: { userId } }), eligibility(userId), exclusions(userId),
    prisma.prospectingOrder.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }),
    prisma.prospectingOrder.findFirst({ where: { userId, status: { in: activeOrderStatuses } } }),
    prisma.prospectingOrder.aggregate({ where: { userId, period: utcPeriod() }, _sum: { reservedCount: true, deliveredCount: true } }),
  ]);
  const suggested = audienceDescription(readIcp(context.profile?.icpDetails)) || context.profile?.icp?.slice(0, 4000) || "";
  const values = workspace || { revision: 0, country: "TW", description: suggested };
  const delivered = usage._sum.deliveredCount || 0, reserved = usage._sum.reservedCount || 0;
  return { enabled: configured(), access: rights, workspace: { revision: values.revision, country: values.country, description: values.description, suggested },
    quota: { period: utcPeriod(), limit: 10, delivered, reserved, remaining: Math.max(0, 10 - delivered - reserved) },
    pending: pending ? orderView(pending, context.names, values) : null, orders: orders.slice(0, 20).map(o => orderView(o, context.names, values)), nextCursor: orders.length > 20 ? orders[19].id : null };
}
export async function getProspectOrder(userId: string, id: string) {
  const [order, context, workspace] = await Promise.all([prisma.prospectingOrder.findFirst({ where: { id, userId } }), exclusions(userId), prisma.prospectingWorkspace.findUnique({ where: { userId } })]);
  if (!order) throw new ProspectingError("找不到公司搜尋訂單 / Search order not found", 404, "not_found");
  return orderView(order, context.names, workspace);
}
export async function createProspectOrder(userId: string, input: z.infer<typeof orderInputSchema>) {
  const payloadHash = hash(input);
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await lockMember(tx, userId);
    const replay = await tx.prospectingOrder.findUnique({ where: { userId_requestId: { userId, requestId: input.requestId } } });
    if (replay) { if (replay.payloadHash !== payloadHash) throw new ProspectingError("同一次提交已使用不同內容；請比較最新版 / Request ID already used with different content", 409, "idempotency_conflict"); return { id: replay.id, status: replay.status }; }
    if (!configured()) throw new ProspectingError("公司搜尋尚未開放，已存名單仍可查看 / Company search is not configured; saved lists remain readable", 503, "not_configured");
    const rights = await eligibility(userId, tx);
    if (!rights.canSearch) throw new ProspectingError(rights.activeTrial && !rights.claimed ? "完成三家有效訪談後可領一次五家公司 / Complete three valid company interviews for one five-company POC" : "需要 NOVA 或有效既有權益；一般試用 POC 每帳號一次 / NOVA or valid existing entitlement required; trial POC is once per account", 403, "access_required");
    if (rights.poc && input.count !== 5) throw new ProspectingError("POC 每次限五家公司 / Trial POC is limited to five companies", 400, "poc_count");
    const pending = await tx.prospectingOrder.findFirst({ where: { userId, OR: [{ status: { in: activeOrderStatuses } }, { leaseUntil: { gt: new Date() } }] }, select: { id: true } });
    if (pending) throw new ProspectingError("已有搜尋進行中，請查看原訂單 / A search is already in progress; check the original order", 409, "order_pending");
    const workspace = await tx.prospectingWorkspace.findUnique({ where: { userId } });
    if ((workspace?.revision || 0) !== input.revision) throw new ProspectingError("另一頁已更新搜尋條件，輸入保留；請載入並比對 / Search criteria changed in another tab; reload and compare", 409, "version_conflict");
    const period = utcPeriod(), monthly = await tx.prospectingOrder.aggregate({ where: { userId, period }, _sum: { reservedCount: true, deliveredCount: true } });
    if ((monthly._sum.reservedCount || 0) + (monthly._sum.deliveredCount || 0) + input.count > 10) throw new ProspectingError("本月交付與預留量已達上限，請選較小批次或下個 UTC 月再試 / Monthly delivered and reserved limit reached; choose a smaller batch or retry next UTC month", 429, "member_quota");
    const context = await exclusions(userId, tx), definition = { description: input.description, countries: [input.country], industries: [], exclude_domains: context.domains };
    const audienceHash = hash(definition), sameAudience = workspace?.audienceHash === audienceHash && workspace.omradeIcpId && workspace.omradeIcpVersion;
    await tx.prospectingWorkspace.upsert({ where: { userId }, create: { userId, country: input.country, description: input.description, revision: 1 }, update: { country: input.country, description: input.description, revision: { increment: 1 } } });
    const order = await tx.prospectingOrder.create({ data: { userId, requestId: input.requestId, payloadHash, country: input.country, description: input.description, count: input.count, poc: rights.poc, period, reservedCount: input.count,
      audienceRequest: json(workspace?.omradeIcpId ? { definition } : { name: "NOVA confirmed buyer criteria", definition }), audienceKey: randomUUID(), audienceParentId: workspace?.omradeIcpId || null,
      omradeIcpId: sameAudience ? workspace!.omradeIcpId : null, omradeIcpVersion: sameAudience ? workspace!.omradeIcpVersion : null, orderKey: randomUUID() } });
    return { id: order.id, status: order.status };
  }, { timeout: 15000 });
}
export async function addProspectContact(userId: string, orderId: string, companyId: string) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB; await lockMember(tx, userId);
    if (!(await eligibility(userId, tx)).fullAccess) throw new ProspectingError("升級後可使用跟進工作區 / Upgrade to use the follow-up workspace", 403, "access_required");
    const order = await tx.prospectingOrder.findFirst({ where: { id: orderId, userId, status: "completed" } });
    const company = order && storedCompanies(order).find(c => c.id === companyId);
    if (!company || !order.checkedAt || Date.now() - order.checkedAt.getTime() > 86400000) throw new ProspectingError("請先重新核對這份本人名單 / Recheck this list before adding a contact", 409, "recheck_required");
    const id = `omrade_${hash([userId, company.id])}`;
    const existing = await tx.contact.findUnique({ where: { id } });
    if (existing) return { id: existing.id };
    const same = await tx.contact.findFirst({ where: { userId, company: { equals: company.name, mode: "insensitive" } } });
    if (same) return { id: same.id };
    const contact = await tx.contact.create({ data: { id, userId, name: company.contact.name || `${company.name} · Company contact`, company: company.name, email: company.contact.kind === "email" ? company.contact.value : null,
      status: "lead", notes: `Omrade public source: ${company.contact.source}\nCompany: ${company.website}\n${company.contact.role || "Company contact; no named person confirmed"}` } });
    return { id: contact.id };
  });
}
