import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { dealCreateSchema, zodMessage } from "@/lib/dashboard/schemas";

// 銷售管道商機 — 建立。若帶 contactId 需驗證該聯絡人屬於本人（不信任前端）。
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);

    const parsed = dealCreateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    const contactId = d.contactId || null;
    if (contactId) {
      const owned = await prisma.contact.findFirst({
        where: { id: contactId, userId: session.uid },
        select: { id: true },
      });
      if (!owned) return fail("聯絡人不存在", 400);
    }

    const row = await prisma.deal.create({
      data: {
        userId: session.uid,
        title: d.title,
        stage: d.stage ?? "lead",
        value: d.value ?? null,
        contactId,
        notes: d.notes || null,
      },
    });
    return ok(row, 201);
  } catch (error) {
    return failFromError(error);
  }
}
