export const REFERRAL_RULES = { version: 1, credits: 5, monthlyLimit: 10, waitDays: 14 } as const;
export class ReferralError extends Error {
  constructor(message: string, public status = 409, public code = "referral_conflict") { super(message); }
}
export function referralCode(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new ReferralError("邀請碼格式無效 / Invalid referral code", 400, "invalid_referral_code");
  const code = value.trim().toUpperCase();
  if (!code) return undefined;
  if (!/^[A-Z0-9]{12}$/.test(code)) throw new ReferralError("邀請碼須為 12 位英數字 / Referral codes contain 12 letters and digits", 400, "invalid_referral_code");
  return code;
}
export function referralMonth(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}
export function amountMinor(value: string) {
  if (!/^\d{1,10}\.\d{2}$/.test(value)) throw new ReferralError("付款金額需要核對 / Payment amount needs review", 409, "payment_review");
  return Number(value.replace(".", ""));
}
export function grantAmounts(debt: number) {
  const offset = Math.min(REFERRAL_RULES.credits, debt);
  return { credits: REFERRAL_RULES.credits - offset, debt: debt - offset, offset };
}
export function revokeAmounts(balance: number, grant: { credits: number; offset: number }) {
  const removed = Math.min(balance, grant.credits);
  return { removed, debt: grant.credits - removed + grant.offset };
}
