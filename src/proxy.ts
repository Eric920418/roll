import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import {
  SESSION_COOKIE,
  USER_SESSION_COOKIE,
  verifySession,
  verifyUserSession,
} from "./lib/auth/session";

const intl = createMiddleware(routing);

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- 後台 API（/api/admin/*）---
  if (pathname.startsWith("/api/admin")) {
    // 公開端點：登入 / 登出；以及 Blob client 直傳（其完成回呼由 Blob 伺服器發出、不帶 cookie，
    // 授權改在 route 的 onBeforeGenerateToken 內以 session 把關）
    if (
      pathname === "/api/admin/login" ||
      pathname === "/api/admin/logout" ||
      pathname === "/api/admin/upload"
    ) {
      return NextResponse.next();
    }
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      return NextResponse.json({ error: "未授權，請重新登入" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // --- 其他 API（公開，如 /api/contact）：不經 next-intl ---
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // --- 後台頁面（/admin/*）---
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // --- 前台：保護 onboarding（需公開用戶登入；涵蓋 /onboarding 與 /zh-tw/onboarding）---
  if (/^\/(zh-tw\/)?onboarding(\/|$)/.test(pathname)) {
    const userSession = await verifyUserSession(
      req.cookies.get(USER_SESSION_COOKIE)?.value,
    );
    if (!userSession) {
      const url = req.nextUrl.clone();
      url.pathname = pathname.startsWith("/zh-tw") ? "/zh-tw/login" : "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // 已登入 → 落到下方 intl(req) 處理 locale
  }

  // --- 前台：交給 next-intl 處理 locale ---
  return intl(req);
}

export const config = {
  // 涵蓋所有路徑（含 /api 與 /admin），排除靜態資源與含副檔名的檔案；
  // 由 middleware 函式內部依路徑分流
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
