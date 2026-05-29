import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { getResource } from "@/lib/cms/resources";
import { revalidateContent } from "@/lib/cms/revalidate";

type Ctx = { params: Promise<{ resource: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { resource } = await params;
  const def = getResource(resource);
  if (!def) return fail("資源不存在", 404);

  try {
    const items = await def.model.findMany({ orderBy: { order: "asc" } });
    return ok(items);
  } catch (error) {
    return failFromError(error);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await requireAdmin())) return unauthorized();
  const { resource } = await params;
  const def = getResource(resource);
  if (!def) return fail("資源不存在", 404);

  try {
    const parsed = def.schema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => `${i.path.join(".")}：${i.message}`).join("；"), 400);
    }
    const created = await def.model.create({ data: parsed.data });
    revalidateContent(def.tag);
    return ok(created, 201);
  } catch (error) {
    return failFromError(error);
  }
}
