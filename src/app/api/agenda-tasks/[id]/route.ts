import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import {
  landingTaskUpdateSchema,
  zodMessage,
  parseDueDate,
} from "@/lib/dashboard/schemas";

type Ctx = { params: Promise<{ id: string }> };

// 勾選 / 改標題 / 改期限。updateMany + userId 條件 = 越權改他人資料會回 404。
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;

    const parsed = landingTaskUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    const data = {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.dueAt !== undefined && { dueAt: parseDueDate(d.dueAt) }),
      ...(d.done !== undefined && { done: d.done }),
    };

    const res = await prisma.landingTask.updateMany({
      where: { id, userId: session.uid },
      data,
    });
    if (res.count === 0) return fail("找不到資料", 404);
    return ok({ updated: true });
  } catch (error) {
    return failFromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;

    const res = await prisma.landingTask.deleteMany({
      where: { id, userId: session.uid },
    });
    if (res.count === 0) return fail("找不到資料", 404);
    return ok({ deleted: true });
  } catch (error) {
    return failFromError(error);
  }
}
