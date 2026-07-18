import "server-only";
import bcrypt from "bcryptjs";

// bcrypt work factor（cost）。12（原為 10）提高離線暴力破解成本，代價是每次雜湊 CPU 略增。
export const BCRYPT_COST = 12;

// 固定 dummy hash（cost 12）：登入時若帳號不存在 / 無密碼，仍對它跑一次 compare，
// 讓「存在」與「不存在」兩條路徑耗時相近，消除「以回應時間枚舉帳號」的側信道。
// 內容為隨機字串的 hash，永不匹配任何真實密碼。
export const DUMMY_PASSWORD_HASH =
  "$2b$12$l18d7CYKv/zpe2am5n8.hOWaA9tmSIDYR53GaDKerwjt/ESJLhqp6";

/** 以專案統一 cost 雜湊密碼 */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}
