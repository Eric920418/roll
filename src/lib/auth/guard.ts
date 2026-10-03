import "server-only";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  USER_SESSION_COOKIE,
  verifySession,
  verifyUserSession,
  acceptsSessionVersion,
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
  const session = await verifyUserSession(store.get(USER_SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.uid }, select: { id: true, email: true, sessionVersion: true } });
  if (!user || !acceptsSessionVersion(session, user.sessionVersion)) return null;
  return { ...session, email: user.email, sessionVersion: user.sessionVersion };
}

/**
 * 防禦性檢查：middleware 已保護 /api/admin，此函式為 route handler 內二次確認。
 * 已授權回 session，未授權回 null（呼叫端應回 401）。
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  return getAdminSession();
}

/** Use at the protected page/data boundary, not only in layouts or proxy. */
export async function requireUserPage(locale: string) {
  const session = await getUserSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect(locale === "zh-tw" ? "/zh-tw/login" : "/login");
  }
  return session;
}

/** Enforce authorization before any admin page data is read, including RSC renders. */
export async function requireAdminPage() {
  const session = await getAdminSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/login");
  }
  return session;
}
