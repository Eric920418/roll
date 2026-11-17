import "server-only";
import type { Prisma } from "@prisma/client";
import { MemberError } from "@/lib/member-http";
import { ledgerInstalled } from "./authority";
export async function assertCreditDeletionAllowed(tx: Prisma.TransactionClient, uid: string) {
  if (!await ledgerInstalled(tx)) return;
  const [row] = await tx.$queryRaw<{ pending: boolean }[]>`SELECT EXISTS(SELECT 1 FROM "CreditHold" h JOIN "CreditAuthority" p ON p."accountId"=h."accountId" JOIN "CreditAccount" a ON a.id=p."accountId" WHERE p."userId"=${uid} AND a.status IN ('active','compatible') AND h.status='reserved') AS pending`;
  if (row.pending) throw new MemberError("尚有點數預扣，請先完成或取消再刪除帳號 / Complete or cancel pending Credits holds before deleting the account", 409);
}
