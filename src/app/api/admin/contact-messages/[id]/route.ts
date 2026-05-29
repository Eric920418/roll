import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, unauthorized, failFromError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    const { isRead } = await req.json();
    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { isRead: Boolean(isRead) },
    });
    return ok(updated);
  } catch (error) {
    return failFromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    await prisma.contactMessage.delete({ where: { id } });
    return ok({ deleted: id });
  } catch (error) {
    return failFromError(error);
  }
}
