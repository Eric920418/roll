import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { getResource } from "@/lib/cms/resources";
import { revalidateContent } from "@/lib/cms/revalidate";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { resource, id } = await params;
  const def = getResource(resource);
  if (!def) return fail("資源不存在", 404);

  try {
    const parsed = def.schema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".")}：${i.message}`).join("；"), 400);
    }
    const updated = await def.model.update({ where: { id }, data: parsed.data });
    revalidateContent(def.tag);
    return ok(updated);
  } catch (error) {
    return failFromError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { resource, id } = await params;
  const def = getResource(resource);
  if (!def) return fail("資源不存在", 404);

  try {
    await def.model.delete({ where: { id } });
    revalidateContent(def.tag);
    return ok({ deleted: id });
  } catch (error) {
    return failFromError(error);
  }
}
