import { z } from "zod";

export const CREDIT_SCALE = 100;
const minor = z.number().int().min(0).max(1_000_000_000_000);
const date = z.string().datetime();
const origin = z.enum(["legacy_token", "included", "purchased", "reward", "referral", "monthly", "compensation", "admin"]);
const lot = z.object({ id: z.string(), origin, remaining: minor, expiresAt: date.nullable() }).strict();
const hold = z.object({ amount: minor, kind: z.enum(["ai", "invite", "search", "adjustment"]), status: z.enum(["reserved", "captured", "refunded"]), expiresAt: date, allocations: z.array(z.object({ lotId: z.string(), amount: minor }).strict()) }).strict();
const event = z.object({ key: z.string(), content: z.string(), kind: z.string(), reason: z.string(), at: date, availableDelta: z.number().int(), reservedDelta: z.number().int(), earnedDelta: z.number().int().default(0), debtDelta: z.number().int().default(0) }).strict();
export const walletSchema = z.object({ version: z.literal(1), migratedAt: date, importedCycle: date.nullable(), legacyMonthlyGrant: minor, lots: z.array(lot), holds: z.record(z.string(), hold), events: z.array(event), earned: minor, referralDebt: minor }).strict().superRefine((wallet, context) => {
  if (wallet.lots.reduce((n, l) => n + l.remaining, 0) + Object.values(wallet.holds).filter(h => h.status === "reserved").reduce((n, h) => n + h.amount, 0) > 1_000_000_000_000) context.addIssue({ code: "custom", message: "點數總額超過安全範圍 / Credits total exceeds safe range" });
  const ids = new Set(wallet.lots.map(l => l.id));
  if (ids.size !== wallet.lots.length || new Set(wallet.events.map(e => e.key)).size !== wallet.events.length) context.addIssue({ code: "custom", message: "點數來源或收據重複 / Duplicate Credits lots or receipts" });
  for (const [id, h] of Object.entries(wallet.holds)) if (h.allocations.reduce((sum, a) => sum + a.amount, 0) !== h.amount || h.allocations.some(a => !ids.has(a.lotId))) context.addIssue({ code: "custom", path: ["holds", id], message: "點數來源配置不一致 / Credits allocation mismatch" });
});
export type CreditWallet = z.infer<typeof walletSchema>;
export type CreditOrigin = z.infer<typeof origin>;
export const points = (amount: number) => amount / CREDIT_SCALE;
export function units(amount: number) {
  const result = Math.round(amount * CREDIT_SCALE);
  if (!Number.isFinite(amount) || Math.abs(result / CREDIT_SCALE - amount) > 1e-9 || !Number.isSafeInteger(result) || Math.abs(result) > 1_000_000_000_000) throw new Error("無效點數數量 / Invalid Credits amount");
  return result;
}
export function emptyWallet(now: Date): CreditWallet { return { version: 1, migratedAt: now.toISOString(), importedCycle: null, legacyMonthlyGrant: 15000, lots: [], holds: {}, events: [], earned: 0, referralDebt: 0 }; }
export function summary(wallet: CreditWallet, now = new Date()) {
  const active = wallet.lots.filter(l => !l.expiresAt || new Date(l.expiresAt) > now);
  const available = active.reduce((sum, l) => sum + l.remaining, 0);
  const expiring = active.filter(l => l.expiresAt && l.remaining).sort((a, b) => a.expiresAt!.localeCompare(b.expiresAt!));
  return { mode: "credits" as const, available: points(available), reserved: points(Object.values(wallet.holds).filter(h => h.status === "reserved").reduce((sum, h) => sum + h.amount, 0)), lifetimeEarned: points(wallet.earned), referralDebt: points(wallet.referralDebt), expiring: expiring.map(l => ({ id: l.id, amount: points(l.remaining), expiresAt: l.expiresAt! })), permanent: points(active.filter(l => !l.expiresAt).reduce((sum, l) => sum + l.remaining, 0)) };
}
function once(wallet: CreditWallet, key: string, content: unknown) {
  const signature = canonical(content), prior = wallet.events.find(e => e.key === key);
  if (prior && prior.content !== signature) throw new Error("同一點數請求內容不一致 / Credits idempotency content mismatch");
  return { replay: Boolean(prior), signature };
}
function record(wallet: CreditWallet, key: string, content: string, kind: string, reason: string, now: Date, availableDelta = 0, reservedDelta = 0, earnedDelta = 0, debtDelta = 0) {
  wallet.events.push({ key, content, kind, reason, at: now.toISOString(), availableDelta, reservedDelta, earnedDelta, debtDelta });
}
export function grant(wallet: CreditWallet, input: { key: string; amount: number; origin: CreditOrigin; expiresAt?: string | null; earned?: boolean; reason: string }, now = new Date()) {
  minor.parse(input.amount); if (input.expiresAt) date.parse(input.expiresAt);
  const op = once(wallet, input.key, input); if (op.replay) return;
  if (wallet.lots.some(l => l.id === input.key)) throw new Error("點數來源重複 / Duplicate Credits lot");
  wallet.lots.push({ id: input.key, origin: input.origin, remaining: input.amount, expiresAt: input.expiresAt ?? null });
  if (input.earned) wallet.earned += input.amount;
  record(wallet, input.key, op.signature, "grant", input.reason, now, input.amount, 0, input.earned ? input.amount : 0);
}
export function expire(wallet: CreditWallet, now = new Date()) {
  for (const l of wallet.lots) if (l.expiresAt && new Date(l.expiresAt) <= now && l.remaining) {
    const amount = l.remaining; l.remaining = 0;
    record(wallet, `expire:${l.id}`, JSON.stringify({ lotId: l.id, amount }), "expire", "本期點數到期 / Cycle Credits expired", now, -amount);
  }
}
export function reserve(wallet: CreditWallet, input: { id: string; amount: number; kind: "ai" | "invite" | "search" | "adjustment"; expiresAt: string }, now = new Date()) {
  minor.positive().parse(input.amount); date.parse(input.expiresAt);
  const op = once(wallet, `reserve:${input.id}`, input); if (op.replay) return;
  if (wallet.holds[input.id]) throw new Error("點數預扣重複 / Duplicate Credits hold");
  expire(wallet, now);
  if (units(summary(wallet, now).available) < input.amount) throw new Error(`點數不足：可用 ${summary(wallet, now).available}，需要 ${points(input.amount)} / Insufficient Credits: ${summary(wallet, now).available} available, ${points(input.amount)} required`);
  // Expiring grants first, purchased Credits last; ties preserve issuance order.
  const lots = wallet.lots.filter(l => l.remaining).sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999") || Number(a.origin === "purchased") - Number(b.origin === "purchased"));
  let remaining = input.amount;
  const allocations: { lotId: string; amount: number }[] = [];
  for (const l of lots) { const amount = Math.min(remaining, l.remaining); if (amount) { l.remaining -= amount; remaining -= amount; allocations.push({ lotId: l.id, amount }); } if (!remaining) break; }
  wallet.holds[input.id] = { amount: input.amount, kind: input.kind, status: "reserved", expiresAt: input.expiresAt, allocations };
  record(wallet, `reserve:${input.id}`, op.signature, "reserve", "點數預扣 / Credits held", now, -input.amount, input.amount);
}
export function settle(wallet: CreditWallet, id: string, action: "capture" | "refund", reason: string, now = new Date(), compensateExpired = false) {
  const h = wallet.holds[id]; if (!h) throw new Error("找不到點數預扣 / Credits hold missing");
  if (h.status === "refunded" || action === "capture" && h.status === "captured") return;
  const held = h.status === "reserved" ? h.amount : 0;
  let returned = 0;
  if (action === "refund") for (const a of h.allocations) {
    const l = wallet.lots.find(l => l.id === a.lotId); if (!l) throw new Error("點數來源遺失 / Credits source missing");
    if (l.expiresAt && new Date(l.expiresAt) <= now) {
      if (compensateExpired) { grant(wallet, { key: `compensate:${id}:${l.id}`, amount: a.amount, origin: "compensation", reason }, now); returned += a.amount; }
    } else { l.remaining += a.amount; returned += a.amount; }
  }
  h.status = action === "capture" ? "captured" : "refunded";
  // Compensation has its own grant receipt, so do not count it twice in this receipt.
  const compensation = wallet.events.filter(e => e.key.startsWith(`compensate:${id}:`)).reduce((sum, e) => sum + e.availableDelta, 0);
  record(wallet, `${action}:${id}`, JSON.stringify({ id, action }), action, reason, now, returned - compensation, -held);
}

export function referralGrant(wallet: CreditWallet, key: string, amount: number, now = new Date()) {
  const op = once(wallet, key, { amount }); if (op.replay) return;
  const offset = Math.min(wallet.referralDebt, amount); wallet.referralDebt -= offset;
  grant(wallet, { key: `${key}:lot`, amount: amount - offset, origin: "referral", earned: true, reason: "推薦獎勵 / Referral reward" }, now);
  record(wallet, key, op.signature, "referral", "推薦獎勵與欠額抵扣 / Referral reward and debt offset", now, 0, 0, 0, -offset);
}
export function referralRevoke(wallet: CreditWallet, key: string, amount: number, now = new Date(), restoredDebt = 0) {
  const op = once(wallet, key, { amount, restoredDebt }); if (op.replay) return;
  let remaining = amount;
  for (const l of wallet.lots.filter(l => l.origin === "referral" || l.origin === "reward")) { const removed = Math.min(remaining, l.remaining); l.remaining -= removed; remaining -= removed; if (!remaining) break; }
  const earnedRemoved = Math.min(wallet.earned, amount);
  wallet.referralDebt += remaining + restoredDebt; wallet.earned -= earnedRemoved;
  record(wallet, key, op.signature, "revoke", "推薦獎勵撤回；不足部分抵扣未來推薦獎勵 / Referral revoked; shortfall offsets future referral rewards", now, -(amount - remaining), 0, -earnedRemoved, remaining + restoredDebt);
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function adjust(wallet: CreditWallet, key: string, amount: number, reason: string, now = new Date()) {
  const request = once(wallet, key, { key, amount, origin: "admin", reason });
  if (request.replay) return;
  if (amount > 0) return grant(wallet, { key, amount, origin: "admin", reason }, now);
  if (!amount) throw new Error("調整點數不可為零 / Credits adjustment cannot be zero");
  const input = { id: key, amount: -amount, kind: "adjustment" as const, expiresAt: new Date(now.getTime() + 60000).toISOString() };
  const prior = wallet.events.find(e => e.key === `reserve:${key}`);
  if (prior) input.expiresAt = wallet.holds[key].expiresAt;
  reserve(wallet, input, now); settle(wallet, key, "capture", reason, now);
  record(wallet, key, request.signature, "adjustment", reason, now);
}
