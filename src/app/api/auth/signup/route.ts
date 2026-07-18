import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createUserSession,
  USER_SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { checkRateLimit, clientIp, MINUTE_MS } from "@/lib/rate-limit";
import { ok, failFromError } from "@/lib/api";

// 帶穩定錯誤碼的失敗回應（前端依 code 顯示對應語系訊息，fallback 顯示 error 原文）
function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : "";
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!emailRaw || !password) {
      return bad("missingFields", "Please fill in all required fields.", 400);
    }
    const email = emailRaw.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return bad("invalidEmail", "Please enter a valid email address.", 400);
    }
    if (password.length < 8) {
      return bad(
        "passwordTooShort",
        "Password must be at least 8 characters.",
        400,
      );
    }

    // 濫註冊護欄：同 IP 15 分鐘內 10 次上限
    const rl = await checkRateLimit(`signup:${clientIp(req)}`, 10, 15 * MINUTE_MS);
    if (!rl.ok) {
      return bad(
        "tooManyAttempts",
        "Too many attempts. Please try again later.",
        429,
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return bad(
        "emailTaken",
        "An account with this email already exists.",
        409,
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        onboardingStep: 2, // 帳號建立完成 → 進入 Step 2（公司資訊）
      },
    });

    const token = await createUserSession(user.id, user.email);
    const res = ok({ nextStep: "company" }, 201);
    res.cookies.set(USER_SESSION_COOKIE, token, cookieOptions);
    return res;
  } catch (error) {
    return failFromError(error);
  }
}
