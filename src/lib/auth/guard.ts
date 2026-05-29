import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type AdminSession } from "./session";

/** 讀取目前後台 session（route handler / server component 用） */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * 防禦性檢查：middleware 已保護 /api/admin，此函式為 route handler 內二次確認。
 * 已授權回 session，未授權回 null（呼叫端應回 401）。
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  return getAdminSession();
}
