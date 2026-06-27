import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();
    // 工具為 Pro 以上功能（defense in depth；頁面也已 gating）
    const account = await requirePlan("pro");
    if (!account) return fail("此功能需 Pro 以上方案", 403);

    const body = await req.json();
    const patch = body?.state;
    if (!patch || typeof patch !== "object") return fail("缺少 state", 400);

    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (typeof k === "string") clean[k] = Boolean(v);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { checklistState: true },
    });
    if (!user) return unauthorized();

    const current =
      (user.checklistState as Record<string, boolean> | null) ?? {};
    await prisma.user.update({
      where: { id: session.uid },
      data: { checklistState: { ...current, ...clean } },
    });
    return ok({ ok: true });
  } catch (error) {
    return failFromError(error);
  }
}
