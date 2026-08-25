import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import {
  contactUpdateSchema,
  zodMessage,
  nullifyEmpty,
} from "@/lib/dashboard/schemas";

type Ctx = { params: Promise<{ id: string }> };

// 更新聯絡人 — updateMany 以 { id, userId } 過濾，確保只能改自己的資料（count 0 → 404）。
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;

    const parsed = contactUpdateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    const data = {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.company !== undefined && { company: nullifyEmpty(d.company) }),
      ...(d.category !== undefined && { category: nullifyEmpty(d.category) }),
      ...(d.email !== undefined && { email: nullifyEmpty(d.email) }),
      ...(d.phone !== undefined && { phone: nullifyEmpty(d.phone) }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.notes !== undefined && { notes: nullifyEmpty(d.notes) }),
    };

    const res = await prisma.contact.updateMany({
      where: { id, userId: session.uid },
      data,
    });
    if (res.count === 0) return fail("找不到資料", 404);
    return ok({ updated: true });
  } catch (error) {
    return failFromError(error);
  }
}

// 刪除聯絡人 — deleteMany 以 { id, userId } 過濾（連到的 Deal.contactId 由 schema 的 SetNull 處理）。
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);
    const { id } = await params;

    const res = await prisma.contact.deleteMany({
      where: { id, userId: session.uid },
    });
    if (res.count === 0) return fail("找不到資料", 404);
    return ok({ deleted: true });
  } catch (error) {
    return failFromError(error);
  }
}
