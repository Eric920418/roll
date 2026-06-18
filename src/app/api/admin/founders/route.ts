import { type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { FOUNDER_FIELDS, pickFields } from "@/lib/admin/quiz-fields";

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data = pickFields(body, FOUNDER_FIELDS);
    if (typeof data.slug !== "string" || !data.slug.trim()) {
      return fail("slug 必填", 400);
    }
    const created = await prisma.founder.create({
      data: data as unknown as Prisma.FounderCreateInput,
    });
    return ok(created, 201);
  } catch (error) {
    return failFromError(error);
  }
}
