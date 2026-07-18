import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import {
  dealUpdateSchema,
  zodMessage,
  nullifyEmpty,
} from "@/lib/dashboard/schemas";

type Ctx = { params: Promise<{ id: string }> };

// 更新商機 — 以 updateMany({ id, userId }) 一次完成擁有權把關 + 更新（與 crm/notes 模式一致）。
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;

    const parsed = dealUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    // contactId 若有值，需屬於本人（避免把商機連到別人的聯絡人）
    if (d.contactId) {
      const c = await prisma.contact.findFirst({
        where: { id: d.contactId, userId: session.uid },
        select: { id: true },
      });
      if (!c) return fail("聯絡人不存在", 400);
    }

    const data = {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.stage !== undefined && { stage: d.stage }),
      ...(d.value !== undefined && { value: d.value }),
      ...(d.contactId !== undefined && { contactId: d.contactId || null }),
      ...(d.notes !== undefined && { notes: nullifyEmpty(d.notes) }),
    };

    const res = await prisma.deal.updateMany({
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

    const res = await prisma.deal.deleteMany({
      where: { id, userId: session.uid },
    });
    if (res.count === 0) return fail("找不到資料", 404);
    return ok({ deleted: true });
  } catch (error) {
    return failFromError(error);
  }
}
