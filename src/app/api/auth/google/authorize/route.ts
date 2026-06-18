import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, localePrefixFromNext } from "@/lib/auth/google";

const GOOGLE_STATE_COOKIE = "g_oauth";

export async function GET(req: NextRequest) {
  const nextParam = req.nextUrl.searchParams.get("next") || "/";
  // 防 open redirect：只接受站內相對路徑
  const next = nextParam.startsWith("/") ? nextParam : "/";

  try {
    const state = crypto.randomUUID();
    const res = NextResponse.redirect(buildAuthUrl(state));
    res.cookies.set(GOOGLE_STATE_COOKIE, JSON.stringify({ state, next }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 分鐘
    });
    return res;
  } catch (error) {
    // 多半是缺憑證；導回對應語系註冊頁並完整顯示錯誤
    const prefix = localePrefixFromNext(next);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.redirect(
      new URL(`${prefix}/signup?error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
