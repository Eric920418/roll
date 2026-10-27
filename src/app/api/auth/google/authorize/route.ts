import { validateReferralCode } from "@/lib/referrals/registration";
import { referralFailure } from "@/lib/referrals/http";
import { ReferralError } from "@/lib/referrals/policy";
import { browserMutationGuard } from "@/lib/security/http";
import { checkRateLimit, clientIp, MINUTE_MS } from "@/lib/rate-limit";
import { fail, failFromError, rateLimited } from "@/lib/api";
import { rollonSignupData, INVALID_ROLLON_CODE } from "@/lib/auth/rollon";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl, localePrefixFromNext } from "@/lib/auth/google";

const GOOGLE_STATE_COOKIE = "g_oauth";

function authorize(req: NextRequest, nextParam: string, rollonCode?: string, referralCode?: string) {
  // 防 open redirect：只接受站內相對路徑
  const next = nextParam.startsWith("/") ? nextParam : "/";

  try {
    const state = crypto.randomUUID();
    const url = buildAuthUrl(state);
    const res = req.method === "POST" ? NextResponse.json({ data: { url } }) : NextResponse.redirect(url);
    res.cookies.set(GOOGLE_STATE_COOKIE, JSON.stringify({ state, next, rollonCode, referralCode }), {
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
    const msg = publicErrorMessage(logSecurityError("oauth.authorize_failed", error));
    return req.method === "POST" ? fail(msg, 500) : NextResponse.redirect(
      new URL(`${prefix}/signup?error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}

export async function GET(req: NextRequest) {
  return authorize(req, req.nextUrl.searchParams.get("next") || "/");
}

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const rl = await checkRateLimit(`signup:${clientIp(req)}`, 10, 15 * MINUTE_MS);
    if (!rl.ok) return rateLimited(rl.retryAfterMs);
    const body = await req.json();
    try {
      rollonSignupData(body.rollonCode);
    } catch {
      return fail(INVALID_ROLLON_CODE, 400);
    }
    const referralCode = await validateReferralCode(body.referralCode);
    return authorize(req, typeof body.next === "string" ? body.next : "/", body.rollonCode, referralCode);
  } catch (error) {
    if (error instanceof ReferralError) return referralFailure(error);
    return failFromError(error);
  }
}
