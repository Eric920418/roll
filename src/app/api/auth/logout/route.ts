import { USER_SESSION_COOKIE } from "@/lib/auth/session";
import { ok } from "@/lib/api";

export async function POST() {
  const res = ok({ ok: true });
  // 立即過期清除用戶 session cookie
  res.cookies.set(USER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
