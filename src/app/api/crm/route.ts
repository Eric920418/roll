import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { contactCreateSchema, zodMessage } from "@/lib/dashboard/schemas";

// CRM 聯絡人 — 建立。proxy 對 /api/* 放行，故此 route 自守衛（session + Pro）並以 session.uid scope。
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);

    const parsed = contactCreateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    const row = await prisma.contact.create({
      data: {
        userId: session.uid,
        name: d.name,
        company: d.company || null,
        email: d.email || null,
        phone: d.phone || null,
        status: d.status ?? "lead",
        notes: d.notes || null,
      },
    });
    return ok(row, 201);
  } catch (error) {
    return failFromError(error);
  }
}
