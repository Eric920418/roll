import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  USER_SESSION_COOKIE,
  verifySession,
  verifyUserSession,
  type AdminSession,
  type UserSession,
} from "./session";

/** 讀取目前後台 session（route handler / server component 用） */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** 讀取目前公開平台用戶 session（route handler / server component 用） */
export async function getUserSession(): Promise<UserSession | null> {
  const store = await cookies();
  return verifyUserSession(store.get(USER_SESSION_COOKIE)?.value);
}

/**
 * 防禦性檢查：middleware 已保護 /api/admin，此函式為 route handler 內二次確認。
 * 已授權回 session，未授權回 null（呼叫端應回 401）。
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  return getAdminSession();
}
