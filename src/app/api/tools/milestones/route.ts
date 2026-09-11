import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { zodMessage } from "@/lib/dashboard/schemas";
import {
  applyMilestoneMutation,
  milestoneMutationSchema,
} from "@/lib/tools/checklist";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    if (!(await requirePlan("pro"))) return fail("此功能需 Pro 以上方案", 403);

    const parsed = milestoneMutationSchema.safeParse(await req.json());
    if (!parsed.success) return fail(zodMessage(parsed.error), 400);

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { milestoneConfig: true },
    });
    if (!user) return unauthorized();

    // ponytail: 單一會員的低頻編輯先用一份 JSON；需要多人同步編輯時再拆列並加版本鎖。
    let next;
    try {
      next = applyMilestoneMutation(
        user.milestoneConfig,
        parsed.data,
        parsed.data.type === "addItem" ? randomUUID() : undefined,
      );
    } catch (error) {
      return failFromError(error, 400);
    }

    await prisma.user.update({
      where: { id: session.uid },
      data: { milestoneConfig: next },
    });

    return ok(next);
  } catch (error) {
    return failFromError(error);
  }
}
