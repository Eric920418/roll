import { type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { QUESTION_FIELDS, pickFields } from "@/lib/admin/quiz-fields";

const DIMENSIONS = ["planning", "execution", "vision"];

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data = pickFields(body, QUESTION_FIELDS);
    if (typeof data.dimension !== "string" || !DIMENSIONS.includes(data.dimension)) {
      return fail("dimension 必須是 planning / execution / vision", 400);
    }
    const created = await prisma.quizQuestion.create({
      data: data as unknown as Prisma.QuizQuestionCreateInput,
    });
    return ok(created, 201);
  } catch (error) {
    return failFromError(error);
  }
}
