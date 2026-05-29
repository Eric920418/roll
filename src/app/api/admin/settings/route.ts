import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { asJson } from "@/lib/cms/json";
import { revalidateContent } from "@/lib/cms/revalidate";
import { SETTINGS_TAG } from "@/lib/cms/tags";

const bodySchema = z.object({
  key: z.string().min(1),
  value: z.record(z.string(), z.unknown()),
});

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("；"), 400);
    }
    const { key, value } = parsed.data;
    const saved = await prisma.setting.upsert({
      where: { key },
      create: { key, value: asJson(value) },
      update: { value: asJson(value) },
    });
    revalidateContent(SETTINGS_TAG);
    return ok(saved);
  } catch (error) {
    return failFromError(error);
  }
}
