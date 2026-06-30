import { type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { QUESTION_FIELDS, pickFields } from "@/lib/admin/quiz-fields";

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data = pickFields(body, QUESTION_FIELDS);
    // dimension 現為分類標籤（計分改由各選項 scores 三維向量決定），僅要求非空字串。
    if (typeof data.dimension !== "string" || !data.dimension.trim()) {
      return fail("dimension 為必填（分類標籤字串）", 400);
    }
    const created = await prisma.quizQuestion.create({
      data: data as unknown as Prisma.QuizQuestionCreateInput,
    });
    return ok(created, 201);
  } catch (error) {
    return failFromError(error);
  }
}
