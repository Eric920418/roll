import { z } from "zod";
import { scopeSchema, salesMutationSchema } from "@/lib/validation/schema";
import { validationSnapshot, saveSalesRecord } from "@/lib/validation/service";
import { verifyProof } from "@/lib/validation/proof";
import { PlanWriteError } from "@/lib/action-plan/service";
import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { dealCreateSchema, zodMessage } from "@/lib/dashboard/schemas";

// 銷售管道商機 — 建立。若帶 contactId 需驗證該聯絡人屬於本人（不信任前端）。
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);

    const body = await req.json();
    if (body.scope) {
      const input = salesMutationSchema.parse(body);
      if (input.proof) await verifyProof(session.uid, input.proof);
      await saveSalesRecord(session.uid, input);
      return ok(await validationSnapshot(session.uid, input.scope));
    }
    const parsed = dealCreateSchema.safeParse(body);
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
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof z.ZodError) return fail(zodMessage(error), 400);
    if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
    return failFromError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    if (!await requirePlan("pro")) return fail("升級後可使用聯絡、話術與成交工作區 / Upgrade to use outreach, scripts and payment evidence", 403);
    const scope = scopeSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    return ok(await validationSnapshot(session.uid, scope));
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof z.ZodError) return fail(zodMessage(error), 400);
    return failFromError(error);
  }
}
