import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { getPlaybook } from "@/lib/playbook/content";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";

// 標記某 playbook 段落已讀/未讀。登入即可（playbook 為登入會員內容，非 Pro-gate）。
// 複製 api/tools/checklist 的「讀-合併-寫回 Json」模式；composite key = `<slug>:<segmentKey>`。
export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const slug = typeof body?.slug === "string" ? body.slug : "";
    const segmentKey = typeof body?.segmentKey === "string" ? body.segmentKey : "";
    const read = Boolean(body?.read);
    if (!slug || !segmentKey) return fail("缺少 slug 或 segmentKey", 400);

    // 驗證 slug + segmentKey 真存在，避免灌任意 key 撐大 playbookReads
    const pb = getPlaybook(slug);
    if (!pb || !pb.segments.some((s) => s.key === segmentKey)) {
      return fail("找不到該段落", 404);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { playbookReads: true },
    });
    if (!user) return unauthorized();

    const current = (user.playbookReads as Record<string, boolean> | null) ?? {};
    const compositeKey = `${slug}:${segmentKey}`;
    const next = { ...current };
    if (read) next[compositeKey] = true;
    else delete next[compositeKey]; // 未讀就移除，避免 map 無限膨脹

    await prisma.user.update({
      where: { id: session.uid },
      data: { playbookReads: next },
    });
    return ok({ ok: true });
  } catch (error) {
    return failFromError(error);
  }
}
