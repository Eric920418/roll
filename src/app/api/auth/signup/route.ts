import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createUserSession,
  USER_SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth/session";
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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return bad(
        "emailTaken",
        "An account with this email already exists.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
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
