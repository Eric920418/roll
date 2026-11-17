import "server-only";
import { tokenQuote } from "@/lib/billing/commerce";
import type { Prisma } from "@prisma/client";
import { ledgerInstalled } from "./authority";
import { accountFor } from "./storage";
export async function memberTokenQuote(tx: Prisma.TransactionClient, uid: string) {
  const current = await tokenQuote(tx);
  if (!await ledgerInstalled(tx)) return current;
  const account = await accountFor(tx, uid);
  if (!account || !["active", "compatible"].includes(account.status)) return current;
  const original = account.source.quote;
  return { ...current, inviteFee: Math.min(current.inviteFee, original.inviteFee), searchFee: Math.min(current.searchFee, original.searchFee), monthlyGrant: Math.max(current.monthlyGrant, original.monthlyGrant), monthlyCompanies: Math.max(current.monthlyCompanies, original.monthlyCompanies), dailyInvites: Math.max(current.dailyInvites, original.dailyInvites) };
}
export async function memberPricing(uid: string) {
  const { prisma } = await import("@/lib/prisma");
  return memberTokenQuote(prisma as unknown as Prisma.TransactionClient, uid);
}
