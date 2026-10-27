import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export const INVALID_ROLLON_CODE = "rollon會員驗證碼無效或尚未啟用，請確認後重試 / Invalid or unavailable rollon membership code; check and retry.";

/** 只在建立新帳號時使用；不接受前端提供的方案或會員標記。 */
export function rollonSignupData(input: unknown, now = new Date()) {
  if (input === undefined || (typeof input === "string" && !input.trim())) return null;
  const expected = process.env.ROLLON_SIGNUP_CODE_SHA256;
  if (typeof input !== "string" || input.length > 128 || !expected || !/^[a-f0-9]{64}$/i.test(expected)) {
    throw new Error(INVALID_ROLLON_CODE);
  }
  const actual = createHash("sha256").update(input.trim().toUpperCase()).digest();
  if (!timingSafeEqual(actual, Buffer.from(expected, "hex"))) throw new Error(INVALID_ROLLON_CODE);
  return { rollonMember: true, plan: "pro" as const, planUpdatedAt: now };
}
