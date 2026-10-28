import { autoCardData, networkEnabled } from "@/lib/network/policy";
import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rewardTransaction } from "@/lib/rewards/service";
import { ReferralError, referralCode } from "./policy";
export function requireReferralConfig() {
  const key = process.env.REFERRAL_PAYER_HMAC_KEY;
  if (!key || Buffer.byteLength(key) < 32) throw new ReferralError("邀請獎勵尚未開放，請移除邀請碼或稍後重試 / Referral rewards are not configured; remove the code or retry later", 503, "referrals_unavailable");
  return key;
}
export async function validateReferralCode(value: unknown) {
  const code = referralCode(value); if (!code) return undefined;
  requireReferralConfig();
  const inviter = await prisma.referralAccount.findFirst({ where: { code, userId: { not: null } }, select: { id: true } });
  if (!inviter) throw new ReferralError("邀請碼不存在或已停用 / Referral code not found or unavailable", 400, "invalid_referral_code");
  return code;
}
export async function registerWithReferral(data: Prisma.UserCreateInput, value: unknown) {
  const code = referralCode(value);
  if (networkEnabled()) data = { ...data, matchmakingProfile: { create: autoCardData } };
  if (!code) return prisma.user.create({ data });
  requireReferralConfig();
  return rewardTransaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('nova-referrals-v1'))::text`;
    const inviter = await tx.referralAccount.findFirst({ where: { code, userId: { not: null } }, include: { user: { select: { email: true } } } });
    if (!inviter) throw new ReferralError("邀請碼不存在或已停用 / Referral code not found or unavailable", 400, "invalid_referral_code");
    if (inviter.user?.email.toLowerCase() === data.email.toLowerCase()) throw new ReferralError("不能邀請自己 / Self-referrals are not allowed", 400, "self_referral");
    return tx.user.create({ data: { ...data, receivedReferral: { create: { inviterId: inviter.id } } } });
  });
}
export async function ensureReferralAccount(userId: string) {
  requireReferralConfig();
  return rewardTransaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('nova-referrals-v1'))::text`;
    if (!await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new ReferralError("請重新登入 / Please log in", 401, "unauthorized");
    return tx.referralAccount.upsert({ where: { userId }, create: { userId, code: randomBytes(6).toString("hex").toUpperCase() }, update: {}, select: { code: true } });
  });
}
