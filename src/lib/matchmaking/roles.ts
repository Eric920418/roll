import { z } from "zod";

export const ROLES = ["founder", "mentor", "investor", "partner", "buyer"] as const;
export const memberRolesSchema = z.array(z.enum(ROLES)).min(1, "請至少選擇一種身份 / Select at least one role").max(ROLES.length).refine(v => new Set(v).size === v.length, "身份不可重複 / Duplicate roles");
export type MemberRole = typeof ROLES[number];
export function memberRoles(row: { role: string; roles?: unknown }): MemberRole[] {
  const parsed = memberRolesSchema.safeParse(row.roles);
  return parsed.success && parsed.data.some(role => role === row.role) ? parsed.data : ROLES.filter(role => role === row.role);
}
export function verificationRoles(row: { role: string; roles?: unknown }) {
  return memberRoles(row).filter(role => role === "investor" || role === "buyer").sort().join(",");
}
export function verifiedInvestor(row: { role: string; roles?: unknown; verified: boolean } | null | undefined) {
  return Boolean(row?.verified && memberRoles(row).includes("investor"));
}
