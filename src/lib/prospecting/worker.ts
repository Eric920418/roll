import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type ProspectingOrder } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, MINUTE_MS, HOUR_MS } from "@/lib/rate-limit";
import { configured, icpResponse, OmradeError, omradeRequest, orderResponse } from "./client";
import { activeOrderStatuses, ProspectingError, uniqueProspects, type PublicProspect } from "./schema";
import { eligibility, exclusions, getProspectOrder, hash, json, lockMember } from "./service";
import { verifyCompany } from "./contact";
const leaseMs = 300000;
async function limitedRequest(path: string, body?: unknown, key?: string) {
  const limit = await checkRateLimit("omrade:http", 60, MINUTE_MS);
  if (!limit.ok) throw new OmradeError(429, "provider_limit", Math.ceil(limit.retryAfterMs / 1000));
  return omradeRequest(path, body, key);
}
async function ownedUpdate(id: string, token: string, data: Prisma.ProspectingOrderUpdateManyMutationInput) {
  const saved = await prisma.prospectingOrder.updateMany({ where: { id, leaseToken: token }, data });
  if (!saved.count) throw new ProspectingError("訂單由另一處理程序接手，請重新讀取 / Order processing lease changed; reload", 409, "lease_changed");
}
async function completeCheck(order: ProspectingOrder, token: string) {
  const response = orderResponse.parse(order.providerResult);
  const companies: PublicProspect[] = [], rejections: Record<string, number> = {};
  // At most two company checks in parallel; each source read has its own strict network budget.
  for (let offset = 0; offset < response.companies.length; offset += 2) {
    const group = await Promise.all(response.companies.slice(offset, offset + 2).map(c => verifyCompany(c, order.country)));
    for (const value of group) { if (value.company) companies.push(value.company); else rejections[value.rejection || "invalid_fields"] = (rejections[value.rejection || "invalid_fields"] || 0) + 1; }
  }
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await lockMember(tx, order.userId);
    const fresh = await tx.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } });
    if (fresh.leaseToken !== token) throw new ProspectingError("訂單處理權已變更 / Processing lease changed", 409, "lease_changed");
    const context = await exclusions(order.userId, tx), eligible = uniqueProspects(companies, context.names);
    if (eligible.length < companies.length) rejections.known_or_duplicate = companies.length - eligible.length;
    const grant = await tx.prospectingTrialGrant.findUnique({ where: { userId: order.userId } });
    if (order.poc && eligible.length && !grant) await tx.prospectingTrialGrant.create({ data: { userId: order.userId, orderId: order.id } });
    await tx.prospectingOrder.update({ where: { id: order.id }, data: { result: json(eligible), rejections, checkedAt: new Date(), status: "completed", leaseToken: null, leaseUntil: null, failureCode: null, failureMessage: null } });
    return eligible.length;
  }, { timeout: 15000 });
}
async function acceptResponse(order: ProspectingOrder, token: string, raw: unknown, retryAfter: number, requestId?: string) {
  const parsed = orderResponse.safeParse(raw);
  if (!parsed.success) throw new OmradeError(503, "provider_invalid_response", 60, requestId);
  const data = parsed.data;
  if (data.requested_count !== order.count || data.icp_id !== order.omradeIcpId || data.icp_version !== order.omradeIcpVersion || (order.providerOrderId && data.order_id !== order.providerOrderId) || data.billing.period !== data.created_at.slice(0, 7) ||
    (data.status === "completed" && (data.delivered_count !== order.count || data.companies.length !== order.count || data.billing.free_companies !== order.count)) ||
    (data.status !== "completed" && data.delivered_count !== 0)) throw new OmradeError(503, "provider_contract", 60, requestId);
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await lockMember(tx, order.userId);
    const saved = await tx.prospectingOrder.updateMany({ where: { id: order.id, leaseToken: token }, data: {
      providerOrderId: data.order_id, providerResult: json(raw), providerRequestId: requestId || null, acceptedAt: new Date(data.created_at), period: data.billing.period,
      deliveredAt: data.delivered_at ? new Date(data.delivered_at) : null, deliveredCount: data.delivered_count,
      reservedCount: data.status === "completed" || data.status === "failed" ? 0 : order.count,
      status: data.status === "completed" ? "checking" : data.status,
      failureCode: data.status === "failed" ? "provider_failed" : null,
      failureMessage: data.status === "failed" ? "供應商未交付公司，預留額度已釋放；可手動重新搜尋 / Provider delivered no companies; reservation released. You may start a new search" : null,
      nextAttemptAt: new Date(Date.now() + Math.max(15, retryAfter) * 1000),
    } });
    if (!saved.count) throw new ProspectingError("處理權已變更 / Processing lease changed", 409, "lease_changed");
  });
  return data.status === "completed";
}
async function submitGate(order: ProspectingOrder, token: string) {
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(537291734)`;
    const fresh = await tx.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } });
    if (fresh.leaseToken !== token) throw new ProspectingError("處理權已變更 / Processing lease changed", 409, "lease_changed");
    if (fresh.submittedAt) return;
    const rights = await eligibility(order.userId, tx);
    if (!rights.canSearch || (order.poc && !rights.poc)) throw new ProspectingError("搜尋權限或 POC 資格已變更，尚未下單 / Search access or POC eligibility changed; order was not submitted", 403, "access_changed");
    const pending = await tx.prospectingOrder.count({ where: { id: { not: order.id }, submittedAt: { not: null }, status: { in: ["pending", "queued", "running", "reconciling"] } } });
    if (pending >= 5) throw new OmradeError(429, "queue_full", 60);
    const recent = await tx.prospectingOrder.count({ where: { submittedAt: { gte: new Date(Date.now() - HOUR_MS) } } });
    if (recent >= 10) throw new OmradeError(429, "hourly_orders", 300);
    const limit = await checkRateLimit("omrade:orders", 10, HOUR_MS, false, tx);
    if (!limit.ok) throw new OmradeError(429, "hourly_orders", Math.ceil(limit.retryAfterMs / 1000));
    await tx.prospectingOrder.update({ where: { id: order.id }, data: { submittedAt: new Date() } });
  }, { timeout: 15000 });
}
async function processOrder(order: ProspectingOrder, token: string) {
  if (order.status === "checking") { await completeCheck(order, token); return true; }
  if (!order.omradeIcpId || !order.omradeIcpVersion) {
    const audience = await limitedRequest(order.audienceParentId ? `/icps/${order.audienceParentId}/versions` : "/icps", order.audienceRequest, order.audienceKey);
    const parsed = icpResponse.safeParse(audience.data); if (!parsed.success) throw new OmradeError(503, "provider_invalid_response", 60, audience.requestId);
    const icp = parsed.data, definition = (order.audienceRequest as { definition: unknown }).definition;
    await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
      await tx.prospectingOrder.updateMany({ where: { id: order.id, leaseToken: token }, data: { omradeIcpId: icp.icp_id, omradeIcpVersion: icp.version, providerRequestId: audience.requestId } });
      await tx.prospectingWorkspace.updateMany({ where: { userId: order.userId, country: order.country, description: order.description }, data: { omradeIcpId: icp.icp_id, omradeIcpVersion: icp.version, audienceHash: hash(definition) } });
    });
    order = await prisma.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } });
  }
  let response;
  if (order.providerOrderId) response = await limitedRequest(`/orders/${order.providerOrderId}`);
  else {
    if (!order.providerRequest) {
      const body = { icp_id: order.omradeIcpId, icp_version: order.omradeIcpVersion, count: order.count, max_charge_cents: 0 };
      await ownedUpdate(order.id, token, { providerRequest: json(body) }); order = { ...order, providerRequest: body as Prisma.JsonValue };
    }
    await submitGate(order, token);
    response = await limitedRequest("/orders", order.providerRequest, order.orderKey);
  }
  const checking = await acceptResponse(order, token, response.data, response.retryAfter, response.requestId);
  if (checking) { await completeCheck(await prisma.prospectingOrder.findUniqueOrThrow({ where: { id: order.id } }), token); return true; }
  return false;
}
async function failedAttempt(order: ProspectingOrder, token: string, error: unknown) {
  const fresh = await prisma.prospectingOrder.findUnique({ where: { id: order.id } });
  if (!fresh || fresh.leaseToken !== token) return;
  const known = error instanceof ProspectingError, provider = error instanceof OmradeError;
  // Only an explicit rejection before acceptance releases a reservation. Never recreate an uncertain operation.
  const definite = !fresh.providerOrderId && known && [400, 401, 402, 403, 404].includes(error.status);
  const delayed = Date.now() - (fresh.submittedAt || fresh.createdAt).getTime() > 40 * MINUTE_MS;
  const retry = Math.max(15, known ? error.retryAfter : 60, Math.min(300, 15 * 2 ** Math.min(fresh.attempts, 4)));
  const message = known ? error.message : "搜尋暫時無法確認，原訂單及預留量保留，系統會重試 / Search unconfirmed; original order and reservation retained for retry";
  await ownedUpdate(order.id, token, { status: definite ? "failed" : fresh.status === "checking" ? "checking" : delayed ? "reconciling" : fresh.status,
    ...(definite ? { reservedCount: 0 } : {}), failureCode: known ? error.code : "processing_unconfirmed", failureMessage: message,
    ...(provider && error.requestId ? { providerRequestId: error.requestId } : {}), nextAttemptAt: new Date(Date.now() + retry * 1000) });
  if (definite && provider && error.status === 404 && order.audienceParentId) await prisma.prospectingWorkspace.updateMany({ where: { userId: order.userId, omradeIcpId: order.audienceParentId }, data: { omradeIcpId: null, omradeIcpVersion: null, audienceHash: null } });
}
export async function runProspecting() {
  if (!process.env.OMRADE_API_KEY) return { enabled: false, processed: 0 };
  const enabled = configured(), deadline = Date.now() + 200000; let processed = 0;
  const seen: string[] = [];
  while (processed < 5 && Date.now() < deadline - 105000) {
    const claimed = await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(537291735)`;
      const order = await tx.prospectingOrder.findFirst({ where: { id: { notIn: seen }, status: { in: activeOrderStatuses }, nextAttemptAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }], ...(!enabled ? { providerOrderId: { not: null } } : {}) }, orderBy: { nextAttemptAt: "asc" } });
      if (!order) return null;
      const token = randomUUID(); await tx.prospectingOrder.update({ where: { id: order.id }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs), attempts: { increment: 1 } } });
      return { order, token };
    });
    if (!claimed) break;
    const { order, token } = claimed; seen.push(order.id); processed++;
    let checked = false;
    try { checked = await processOrder(order, token); }
    catch (error) { await failedAttempt(order, token, error); }
    finally { await prisma.prospectingOrder.updateMany({ where: { id: order.id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } }); }
    if (checked) break;
  }
  return { enabled, processed };
}
export async function recheckProspectOrder(userId: string, id: string) {
  const token = randomUUID();
  const order = await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    await lockMember(tx, userId);
    const order = await tx.prospectingOrder.findFirst({ where: { id, userId } });
    if (!order || order.status !== "completed" || !order.providerResult) throw new ProspectingError("只能核對已交付的本人名單 / Only your completed lists can be rechecked", 404, "not_found");
    if (order.leaseUntil && order.leaseUntil > new Date()) throw new ProspectingError("此名單正在核對 / List check in progress", 409, "order_pending");
    const pending = await tx.prospectingOrder.findFirst({ where: { userId, id: { not: id }, status: { in: activeOrderStatuses } }, select: { id: true } });
    const grant = await tx.prospectingTrialGrant.findUnique({ where: { userId } });
    if (order.poc && (pending || grant && grant.orderId !== id)) throw new ProspectingError("請先查看目前的 POC 名單 / Check your current POC list first", 409, "poc_claimed");
    const rate = await checkRateLimit(`omrade-recheck:${userId}`, 3, HOUR_MS, false, tx);
    if (!rate.ok) throw new ProspectingError("來源核對每小時最多三次 / Contact sources can be rechecked three times per hour", 429, "recheck_limit");
    await tx.prospectingOrder.update({ where: { id }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs) } }); return order;
  });
  try { await completeCheck(order, token); return await getProspectOrder(userId, id); }
  finally { await prisma.prospectingOrder.updateMany({ where: { id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } }); }
}
export async function providerUsage() {
  const usage = await limitedRequest("/usage");
  return z.object({ period: z.string(), free_delivered: z.number(), free_reserved: z.number(), free_available: z.number(), paid_enabled: z.boolean() }).parse(usage.data);
}
