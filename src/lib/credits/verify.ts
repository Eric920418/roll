import "server-only";
import type { Prisma } from "@prisma/client";
import { readWallet, type CreditAccountRow } from "./storage";
import { summary } from "./policy";
export async function verifyLedger(tx: Prisma.TransactionClient, now = new Date()) {
  const [mode] = await tx.$queryRaw<{ readOnly: string; isolation: string }[]>`SELECT current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS isolation`;
  if (mode.readOnly !== "on" || !["repeatable read", "serializable"].includes(mode.isolation)) throw new Error("核對需一致唯讀快照 / Verification requires a repeatable read-only snapshot");
  const rows = await tx.$queryRaw<CreditAccountRow[]>`SELECT * FROM "CreditAccount" ORDER BY id`;
  const results = [];
  for (const account of rows) {
    const wallet = await readWallet(tx, account), totals = wallet.events.reduce((s, e) => ({ available: s.available + e.availableDelta, reserved: s.reserved + e.reservedDelta, earned: s.earned + e.earnedDelta, debt: s.debt + e.debtDelta }), { available: 0, reserved: 0, earned: 0, debt: 0 });
    if (totals.available !== wallet.lots.reduce((n, l) => n + l.remaining, 0) || totals.reserved !== Object.values(wallet.holds).filter(h => h.status === "reserved").reduce((n, h) => n + h.amount, 0) || totals.earned !== wallet.earned || totals.debt !== wallet.referralDebt || wallet.events.length !== account.version) throw new Error(`點數帳本不平 / Credits ledger does not balance: ${account.id}`);
    results.push({ accountId: account.id, status: account.status, receipts: account.version, ...summary(wallet, now) });
  }
  return { accounts: rows.length, balanced: true, results };
}
