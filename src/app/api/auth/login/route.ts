import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createUserSession,
  USER_SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth/session";
import { ok, failFromError } from "@/lib/api";

function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

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
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!emailRaw || !password) {
      return bad("missingFields", "Please fill in all required fields.", 400);
    }
    const email = emailRaw.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    // 找不到、或 Google-only 帳號（無密碼）→ 一律回相同訊息，避免帳號列舉
    if (!user || !user.passwordHash) {
      return bad(
        "invalidCredentials",
        "Email or password is incorrect.",
        401,
      );
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return bad(
        "invalidCredentials",
        "Email or password is incorrect.",
        401,
      );
    }

    const token = await createUserSession(user.id, user.email);
    const res = ok({
      completed: user.completed,
      onboardingStep: user.onboardingStep,
    });
    res.cookies.set(USER_SESSION_COOKIE, token, cookieOptions);
    return res;
  } catch (error) {
    return failFromError(error);
  }
}
