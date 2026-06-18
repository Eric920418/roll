import { type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, unauthorized, failFromError } from "@/lib/api";
import { QUESTION_FIELDS, pickFields } from "@/lib/admin/quiz-fields";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const updated = await prisma.quizQuestion.update({
      where: { id },
      data: pickFields(
        body,
        QUESTION_FIELDS,
      ) as unknown as Prisma.QuizQuestionUpdateInput,
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
    await prisma.quizQuestion.delete({ where: { id } });
    return ok({ deleted: id });
  } catch (error) {
    return failFromError(error);
  }
}
