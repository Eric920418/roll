import "server-only";
import { tokenQuote } from "@/lib/billing/commerce";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MemberError } from "@/lib/member-http";
import { networkAccount } from "@/lib/network/access";
type DB = Prisma.TransactionClient;
export const tokenHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class TokenError extends MemberError {}
export async function lockWallet(tx: DB, userId: string) {
  const user = await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR KEY SHARE` as unknown[];
  if (!user.length) throw new TokenError("找不到會員 / Member not found", 404);
  await tx.tokenWallet.createMany({ data: { userId }, skipDuplicates: true });
  await tx.$queryRaw`SELECT "userId" FROM "TokenWallet" WHERE "userId" = ${userId} FOR UPDATE`;
  return tx.tokenWallet.findUniqueOrThrow({ where: { userId } });
}
async function entry(tx: DB, userId: string, eventKey: string, kind: string, availableDelta: number, reservedDelta: number, reason: string, reservationId?: string) {
  const previous = await tx.tokenLedger.findUnique({ where: { eventKey } });
  if (previous) {
    if (previous.userId !== userId || previous.kind !== kind || previous.availableDelta !== availableDelta || previous.reservedDelta !== reservedDelta || previous.reason !== reason || previous.reservationId !== (reservationId || null)) throw new TokenError("冪等鍵已用於不同帳務內容 / Idempotency key has different ledger content", 409);
    return previous;
  }
  const wallet = await tx.tokenWallet.findUniqueOrThrow({ where: { userId } });
  if (wallet.available + availableDelta < 0) throw new TokenError(`Token 不足：可用 ${wallet.available}，本次需要 ${-availableDelta} / Insufficient Token balance: ${wallet.available} available, ${-availableDelta} required`, 402);
  if (wallet.reserved + reservedDelta < 0 || wallet.available + availableDelta > 1000000000) throw new TokenError("Token 帳務數值不一致，請聯絡管理員 / Token balance mismatch; contact administrator", 409);
  await tx.tokenWallet.update({ where: { userId }, data: { available: { increment: availableDelta }, reserved: { increment: reservedDelta } } });
  return tx.tokenLedger.create({ data: { userId, eventKey, kind, availableDelta, reservedDelta, reason, reservationId } });
}
export async function grantTokens(tx: DB, userId: string, amount: number, key: string, reason: string) {
  await lockWallet(tx, userId);
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) throw new TokenError("無效 Token 數量 / Invalid Token amount", 400);
  return entry(tx, userId, key, "grant", amount, 0, reason);
}
export async function monthlyTokens(tx: DB, userId: string) {
  await lockWallet(tx, userId);
  const key = `monthly:${userId}:${new Date().toISOString().slice(0, 7)}`;
  const reason = "每月方案贈額 / Monthly plan grant", prior = await tx.tokenLedger.findUnique({ where: { eventKey: key } });
  if (prior) {
    if (prior.userId !== userId || prior.kind !== "grant" || prior.availableDelta < 0 || prior.availableDelta > 1000000 || prior.reservedDelta !== 0 || prior.reservationId !== null || prior.reason !== reason) throw new TokenError("月贈額紀錄不一致，請聯絡管理員 / Monthly grant record mismatch; contact an administrator", 409);
    return;
  }
  if ((await networkAccount(userId, tx)).effectivePlan !== "free") { const quote = await tokenQuote(tx); await entry(tx, userId, key, "grant", quote.monthlyGrant, 0, reason); }
}
export async function reserveTokens(tx: DB, input: { userId: string; requestId: string; payloadHash: string; kind: "invite" | "search"; resourceId: string; resourceVersion?: number; expiresAt: Date; metadata?: Prisma.InputJsonValue; poc?: boolean }) {
  await monthlyTokens(tx, input.userId);
  const previous = await tx.tokenReservation.findUnique({ where: { userId_requestId: { userId: input.userId, requestId: input.requestId } } });
  if (previous) {
    if (previous.payloadHash !== input.payloadHash || previous.kind !== input.kind || previous.resourceId !== input.resourceId || previous.resourceVersion !== (input.resourceVersion || 0)) throw new TokenError("同一次提交已使用不同內容 / Request ID already used with different content", 409);
    return previous;
  }
  const quote = await tokenQuote(tx);
  const gift = input.kind === "search" && input.poc ? await tx.tokenLedger.findUnique({ where: { eventKey: `poc:${input.userId}` } }) : null;
  const amount = input.kind === "invite" ? quote.inviteFee : gift?.availableDelta || quote.searchFee;
  const { metadata, ...data } = input;
  delete data.poc;
  const reservation = await tx.tokenReservation.create({ data: { ...data, amount, metadata: { ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}), pricing: { version: quote.version, amount } } } });
  await entry(tx, input.userId, `reserve:${reservation.id}`, "reserve", -amount, amount, input.kind === "invite" ? "交流邀請預扣 / Invitation hold" : "五家公司搜尋預扣 / Five-company search hold", reservation.id);
  return reservation;
}
export async function settleTokens(tx: DB, id: string, action: "capture" | "refund", reason: string) {
  const first = await tx.tokenReservation.findUniqueOrThrow({ where: { id } });
  await lockWallet(tx, first.userId);
  const row = await tx.tokenReservation.findUniqueOrThrow({ where: { id } });
  if (action === "capture") {
    if (row.status !== "reserved") return row;
    await entry(tx, row.userId, `capture:${id}`, "capture", 0, -row.amount, reason, id);
  } else {
    if (["released", "refunded"].includes(row.status)) return row;
    if (row.status !== "reserved" && row.status !== "captured") throw new TokenError("未知 Token 狀態 / Unknown Token state", 409);
    await entry(tx, row.userId, `refund:${id}`, row.status === "reserved" ? "release" : "refund", row.amount, row.status === "reserved" ? -row.amount : 0, reason, id);
  }
  return tx.tokenReservation.update({ where: { id }, data: { status: action === "capture" ? "captured" : row.status === "reserved" ? "released" : "refunded", settledAt: new Date() } });
}
export async function resourceFee(tx: DB, kind: string, resourceId: string, resourceVersion?: number) {
  return tx.tokenReservation.findFirst({ where: { kind, resourceId, ...(resourceVersion === undefined ? {} : { resourceVersion }) }, orderBy: { createdAt: "desc" } });
}
export async function tokenSnapshot(userId: string, cursor?: string) {
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    await monthlyTokens(tx, userId);
    if (cursor && !await tx.tokenLedger.findFirst({ where: { id: cursor, userId } })) throw new TokenError("無效帳本頁次 / Invalid ledger cursor", 400);
    const wallet = await tx.tokenWallet.findUniqueOrThrow({ where: { userId } });
    const rows = await tx.tokenLedger.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, kind: true, availableDelta: true, reservedDelta: true, reason: true, createdAt: true, reservationId: true } });
    const pricing = await tokenQuote(tx);
    return { available: wallet.available, reserved: wallet.reserved, monthlyGrant: pricing.monthlyGrant, pricing, period: new Date().toISOString().slice(0, 7), ledger: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
  }, { timeout: 15000 });
}
