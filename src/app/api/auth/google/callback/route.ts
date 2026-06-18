import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForProfile, localePrefixFromNext } from "@/lib/auth/google";
import {
  createUserSession,
  USER_SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth/session";
import { destinationFor } from "@/lib/auth/onboarding";
import type { Locale } from "@/i18n/routing";

const GOOGLE_STATE_COOKIE = "g_oauth";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  // 先解析 state cookie（取得 next，決定錯誤導回的語系）
  let saved: { state: string; next: string } | null = null;
  try {
    const raw = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }
  const next = saved?.next || "/";
  const prefix = localePrefixFromNext(next);
  const locale: Locale = prefix === "/zh-tw" ? "zh-tw" : "en";

  const redirectError = (msg: string) =>
    NextResponse.redirect(
      new URL(`${prefix}/signup?error=${encodeURIComponent(msg)}`, req.url),
    );

  try {
    const oauthError = params.get("error");
    if (oauthError) return redirectError(`Google 授權未完成：${oauthError}`);

    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) return redirectError("缺少授權碼或 state");
    if (!saved || saved.state !== state) {
      return redirectError("state 驗證失敗，請重新嘗試");
    }

    const profile = await exchangeCodeForProfile(code);

    // 以 googleId 為主鍵查既有 Google 用戶
    let user = await prisma.user.findUnique({
      where: { googleId: profile.sub },
    });
    if (!user) {
      // 安全：絕不以 email 自動連結既有（密碼）帳號 —— 防 OAuth 帳號預劫持。
      // 攻擊者可先用受害者 email 註冊密碼帳號（signup 不驗證 email），
      // 受害者之後用 Google 登入若被自動連結，就會被導進攻擊者控制的帳號。
      const byEmail = await prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (byEmail) {
        return NextResponse.redirect(
          new URL(
            `${prefix}/login?error=${encodeURIComponent(
              "此 Email 已有帳號，請改用密碼登入。",
            )}`,
            req.url,
          ),
        );
      }
      // 僅在 Google 已驗證該 email 時才建立新帳號
      if (!profile.emailVerified) {
        return redirectError("你的 Google 帳號 Email 尚未驗證，無法以此註冊");
      }
      user = await prisma.user.create({
        data: {
          email: profile.email,
          googleId: profile.sub,
          firstName: profile.firstName,
          lastName: profile.lastName,
          image: profile.picture,
          emailVerified: new Date(), // Google 已驗證
          onboardingStep: 2, // Google 註冊即完成帳號步驟
        },
      });
    }

    const token = await createUserSession(user.id, user.email);
    const dest = destinationFor(
      { completed: user.completed, onboardingStep: user.onboardingStep },
      locale,
    );
    const res = NextResponse.redirect(new URL(dest, req.url));
    res.cookies.set(USER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (error) {
    return redirectError(error instanceof Error ? error.message : String(error));
  }
}
