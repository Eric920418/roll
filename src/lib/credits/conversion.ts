import { emptyWallet, grant, points, summary, units, type CreditWallet } from "./policy";
import { z } from "zod";
const count = z.number().int().nonnegative();
export const legacySnapshotSchema = z.object({ userId: z.string().min(1), tokenAvailable: count, tokenReserved: count, rewardPoints: count, earnedRewardPoints: count, bonus: count, reward: count, referralDebt: count, earnedReferrals: count, monthlyGrant: count, included: z.object({ remaining: count.max(150), expiresAt: z.string().datetime(), cycleStart: z.string().datetime() }).strict().nullable(), holds: z.array(z.object({ id: z.string().min(1), amount: count.positive(), kind: z.enum(["ai", "invite", "search"]), status: z.enum(["reserved", "captured"]), expiresAt: z.string().datetime(), origin: z.enum(["legacy_token", "included", "reward", "purchased"]), lotExpiresAt: z.string().datetime().nullable() }).strict()) }).strict();

export type LegacySnapshot = {
  userId: string;
  tokenAvailable: number; tokenReserved: number;
  rewardPoints: number; earnedRewardPoints: number;
  bonus: number; reward: number; referralDebt: number; earnedReferrals: number;
  included: { remaining: number; expiresAt: string; cycleStart: string } | null;
  monthlyGrant: number;
  holds: { id: string; amount: number; kind: "ai" | "invite" | "search"; status: "reserved" | "captured"; expiresAt: string; origin: "legacy_token" | "included" | "reward" | "purchased"; lotExpiresAt: string | null }[];
};
export function convertLegacy(input: LegacySnapshot, now = new Date()) {
  input = legacySnapshotSchema.parse(input);
  for (const [key, amount] of Object.entries(input)) if (typeof amount === "number" && (!Number.isSafeInteger(amount) || amount < 0)) throw new Error(`舊餘額無法核對 / Invalid legacy balance: ${key}`);
  if (input.holds.filter(h => h.status === "reserved" && h.kind !== "ai").reduce((s, h) => s + h.amount, 0) !== input.tokenReserved) throw new Error("舊預扣與帳本不一致，保留原制度等待核對 / Legacy holds mismatch; retain original system pending review");
  if (new Set(input.holds.map(h => h.id)).size !== input.holds.length) throw new Error("舊預扣重複 / Duplicate legacy holds");
  const wallet = emptyWallet(now);
  wallet.importedCycle = input.included?.cycleStart ?? null;
  wallet.legacyMonthlyGrant = units(input.monthlyGrant);
  const labels: Record<string, string> = { token: "既有錢包轉入 / Existing wallet converted", purchased_ai: "加購餘額轉入 / Purchased balance converted", reward_ai: "獎勵餘額轉入 / Reward balance converted", unredeemed_points: "未兌換獎勵轉入 / Unredeemed rewards converted", included_ai: "當期額度轉入 / Current cycle allowance converted" };
  const rows: { source: string; oldAmount: number; credits: number; expiresAt: string | null }[] = [];
  const add = (source: string, oldAmount: number, amount: number, origin: "legacy_token" | "reward" | "included" | "purchased", expiresAt: string | null = null) => {
    if (amount < 0 || !Number.isSafeInteger(amount)) throw new Error(`轉換數量無效 / Invalid conversion amount: ${source}`);
    grant(wallet, { key: `migration:${source}`, amount, origin, expiresAt, reason: labels[source] }, now);
    rows.push({ source, oldAmount, credits: points(amount), expiresAt });
  };
  add("token", input.tokenAvailable, units(input.tokenAvailable), "legacy_token");
  add("purchased_ai", input.bonus, units(input.bonus), "purchased");
  add("reward_ai", input.reward, units(input.reward), "reward");
  add("unredeemed_points", input.rewardPoints, input.rewardPoints * 5, "reward");
  if (input.included) add("included_ai", input.included.remaining, units(input.included.remaining), "included", input.included.expiresAt);
  for (const h of input.holds) {
    const lotId = `migration:hold:${h.id}`;
    grant(wallet, { key: lotId, amount: 0, origin: h.origin, expiresAt: h.lotExpiresAt, reason: "保留舊訂單來源 / Preserve original order source" }, now);
    wallet.holds[h.id] = { amount: units(h.amount), kind: h.kind, status: h.status, expiresAt: h.expiresAt, allocations: [{ lotId, amount: units(h.amount) }] };
    wallet.events.push({ key: `migration:held:${h.id}`, content: JSON.stringify(h), kind: "migration_hold", reason: "原訂單預扣／結算保留 / Original order hold or charge preserved", at: now.toISOString(), availableDelta: 0, reservedDelta: h.status === "reserved" ? units(h.amount) : 0, earnedDelta: 0, debtDelta: 0 });
  }
  wallet.earned = input.earnedRewardPoints * 5 + units(input.earnedReferrals);
  wallet.referralDebt = units(input.referralDebt);
  wallet.events.push({ key: "migration:counters", content: JSON.stringify({ earned: wallet.earned, debt: wallet.referralDebt }), kind: "migration", reason: "保留累積成就與推薦欠額 / Preserve earned progress and referral debt", at: now.toISOString(), availableDelta: 0, reservedDelta: 0, earnedDelta: wallet.earned, debtDelta: wallet.referralDebt });
  const expected = input.tokenAvailable + input.bonus + input.reward + input.rewardPoints / 20 + (input.included?.remaining ?? 0);
  if (units(summary(wallet, now).available) !== units(expected)) throw new Error("轉換前後可用權益不一致 / Conversion entitlement mismatch");
  return { userId: input.userId, rows, before: input, after: summary(wallet, now), wallet };
}
export function importPendingAi(wallet: CreditWallet, now: Date) {
  return Object.entries(wallet.holds).filter(([, h]) => h.kind === "ai" && h.status === "reserved" && new Date(h.expiresAt) <= now).map(([id]) => id);
}
