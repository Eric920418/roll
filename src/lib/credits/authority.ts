import "server-only";
import type { Prisma } from "@prisma/client";
import { MemberError } from "@/lib/member-http";
import { localCreditsEnabled } from "./local";
export async function ledgerInstalled(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ installed: boolean }[]>`SELECT to_regclass('public."CreditControl"') IS NOT NULL AS installed`;
  return row.installed;
}
export async function creditsEnabledFor(tx: Prisma.TransactionClient, uid: string): Promise<boolean> {
  localCreditsEnabled(); // Validate the isolated-only flag, never use it as financial authority.
  if (!await ledgerInstalled(tx)) return false;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('nova-credit-cutover'))::text`;
  const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id=${uid} FOR UPDATE`;
  if (!users.length) throw new MemberError("找不到會員 / Member not found", 404);
  const [row] = await tx.$queryRaw<{ route: string }[]>`SELECT nova_credit_route(${uid}) AS route`;
  if (row.route === "required") {
    const [newMember] = await tx.$queryRaw<{ eligible: boolean }[]>`SELECT EXISTS(SELECT 1 FROM "CreditRegistration" WHERE "userId"=${uid}) AND NOT EXISTS(SELECT 1 FROM "CreditAuthority" WHERE "userId"=${uid}) AS eligible`;
    if (!newMember.eligible) throw new MemberError("會員尚未完成點數核對，請聯絡管理員 / Credits reconciliation required; contact an administrator", 409);
    const { prepareMember, activateMember } = await import("./cutover");
    const prepared = await prepareMember(tx, uid, { key: `enrol:prepare:${uid}`, actor: "registration", reason: "新會員點數帳戶 / New member Credits account" });
    await activateMember(tx, uid, prepared.sourceHash, { key: `enrol:activate:${uid}`, actor: "registration", reason: "新會員點數帳戶 / New member Credits account" });
  }
  if (row.route !== "legacy") { await tx.$queryRaw`SELECT set_config('nova.credit_writer_user',${uid},true)`; return true; }
  return false;
}
export async function memberCreditsEnabled(uid: string) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction(tx => creditsEnabledFor(tx as unknown as Prisma.TransactionClient, uid), { timeout: 15000 });
}
