import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, unauthorized, failFromError } from "@/lib/api";

function bad(code: string, error: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

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

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: session.uid },
      data: { passwordHash },
    });
    return ok({ ok: true });
  } catch (error) {
    return failFromError(error);
  }
}
