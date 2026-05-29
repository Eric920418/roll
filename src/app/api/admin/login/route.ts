import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";
import { fail, failFromError } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (typeof email !== "string" || typeof password !== "string") {
      return fail("請輸入帳號與密碼", 400);
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminEmail || !adminHash) {
      return fail("伺服器未設定管理員帳密（ADMIN_EMAIL / ADMIN_PASSWORD_HASH）", 500);
    }

    const emailMatch = email.trim().toLowerCase() === adminEmail.toLowerCase();
    const passwordMatch = await bcrypt.compare(password, adminHash);
    if (!emailMatch || !passwordMatch) {
      return fail("帳號或密碼錯誤", 401);
    }

    const token = await createSession(adminEmail);
    const res = NextResponse.json({ data: { ok: true } });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (error) {
    return failFromError(error);
  }
}
