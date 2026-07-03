import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { noteCreateSchema, zodMessage, parseDate } from "@/lib/dashboard/schemas";

// 會議記錄 — 建立。
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);

    const parsed = noteCreateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    const row = await prisma.meetingNote.create({
      data: {
        userId: session.uid,
        title: d.title,
        body: d.body || null,
        meetingAt: parseDate(d.meetingAt) ?? null,
      },
    });
    return ok(row, 201);
  } catch (error) {
    return failFromError(error);
  }
}
