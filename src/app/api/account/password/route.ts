import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
import { ok, unauthorized, failFromError } from "@/lib/api";

function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    // 暴力猜舊密碼護欄：每會員 15 分鐘內 5 次上限
    const rl = await checkRateLimit(`pw:${session.uid}`, 5, 15 * MINUTE_MS);
    if (!rl.ok) {
      return bad(
        "tooManyAttempts",
        "Too many attempts. Please try again later.",
        429,
      );
    }

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

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: session.uid },
      data: { passwordHash },
    });
    return ok({ ok: true });
  } catch (error) {
    return failFromError(error);
  }
}
