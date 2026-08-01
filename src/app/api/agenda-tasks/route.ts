import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import {
  landingTaskCreateSchema,
  zodMessage,
  parseDueDate,
} from "@/lib/dashboard/schemas";

// 落地待辦自訂任務 — 建立。
export async function POST(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    // 落地待辦為 Pro 以上功能（defense in depth；頁面也已 gating）
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);

    const parsed = landingTaskCreateSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);
    const d = parsed.data;

    // 每人上限，擋灌爆（系統模板任務約 4–24 項，200 已遠超正常使用）
    const count = await prisma.landingTask.count({
      where: { userId: session.uid },
    });
    if (count >= 200) return fail("自訂任務已達上限（200 筆）", 400);

    const row = await prisma.landingTask.create({
      data: {
        userId: session.uid,
        title: d.title,
        dueAt: parseDueDate(d.dueAt) ?? null,
      },
    });
    return ok(row, 201);
  } catch (error) {
    return failFromError(error);
  }
}
