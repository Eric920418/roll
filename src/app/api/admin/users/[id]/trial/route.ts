import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    const body = await req.json();
    const plan = body?.plan;
    if (plan !== "pro" && plan !== "business") {
      return fail("試用方案只能是 Pro 或 Business。", 400);
    }
    const startsAt = parseDate(body?.startsAt);
    const endsAt = parseDate(body?.endsAt);
    if (!startsAt || !endsAt) return fail("請提供有效的試用開始與結束時間。", 400);
    if (endsAt <= startsAt) return fail("試用結束時間必須晚於開始時間。", 400);

    const updated = await prisma.user.updateMany({
      where: { id },
      data: { trialPlan: plan, trialStartsAt: startsAt, trialEndsAt: endsAt },
    });
    if (updated.count === 0) return fail("找不到這個會員帳號。", 404);
    return ok({ id, plan, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  } catch (error) {
    return failFromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    const updated = await prisma.user.updateMany({
      where: { id },
      data: { trialPlan: null, trialStartsAt: null, trialEndsAt: null },
    });
    if (updated.count === 0) return fail("找不到這個會員帳號。", 404);
    return ok({ id, revoked: true });
  } catch (error) {
    return failFromError(error);
  }
}
