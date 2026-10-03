import { browserMutationGuard } from "@/lib/security/http";
import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { createUserSession, USER_SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";
import { ok, unauthorized, failFromError, rateLimited } from "@/lib/api";

function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    // 暴力猜舊密碼護欄：每會員 15 分鐘內 5 次上限
    const rl = await checkRateLimit(`pw:${session.uid}`, 5, 15 * MINUTE_MS);
    if (!rl.ok) return rateLimited(rl.retryAfterMs);

    const body = await req.json();
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 8) {
      return bad("tooShort", "Password must be at least 8 characters.", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: session.uid } });
    if (!user) return unauthorized();

    // 已有密碼者 → 變更需驗舊密碼；Google-only（無密碼）→ 視為「設定密碼」免舊密碼
    if (user.passwordHash) {
      if (!currentPassword) {
        return bad("missing", "Please enter your current password.", 400);
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return bad("wrongPassword", "Current password is incorrect.", 401);
      }
    }

    if (Buffer.byteLength(newPassword, "utf8") > 72) return bad("tooLong", "Password must not exceed 72 UTF-8 bytes.", 400);
    if (user.sessionVersion !== session.sessionVersion) return unauthorized();
    const passwordHash = await hashPassword(newPassword);
    // Compare-and-swap also covers concurrent Google-only password setup.
    const updated = await prisma.user.updateMany({
      where: { id: session.uid, sessionVersion: user.sessionVersion, passwordHash: user.passwordHash },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) return bad("session_changed", "登入或密碼已更新，請重新登入 / Session changed; sign in again", 409);
    const token = await createUserSession(user.id, user.email, user.sessionVersion + 1);
    const response = ok({ ok: true });
    response.cookies.set(USER_SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
    return response;
  } catch (error) {
    return failFromError(error);
  }
}
