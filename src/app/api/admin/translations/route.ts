import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { messagesTag } from "@/lib/cms/messages";
import { setIn } from "@/lib/cms/messages-tree";
import { asJson } from "@/lib/cms/json";
import { revalidateContent } from "@/lib/cms/revalidate";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const bodySchema = z.object({
  entries: z.array(
    z.object({
      // 僅允許 dot-path（字母/數字/底線/連字號），並拒絕原型污染鍵
      path: z
        .string()
        .min(1)
        .regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/, "path 格式不合法")
        .refine(
          (p) => !p.split(".").some((k) => DANGEROUS_KEYS.has(k)),
          "path 含不允許的鍵",
        ),
      en: z.string(),
      "zh-tw": z.string(),
    }),
  ),
});

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("；"), 400);
    }
    const { entries } = parsed.data;

    // 讀現有覆蓋，套用變更後 upsert（只覆蓋有送出的鍵，其餘跟隨 base）
    const [enRow, zhRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "messages.en" } }),
      prisma.setting.findUnique({ where: { key: "messages.zh-tw" } }),
    ]);
    const enOverride = (enRow?.value as Record<string, unknown>) ?? {};
    const zhOverride = (zhRow?.value as Record<string, unknown>) ?? {};

    for (const entry of entries) {
      setIn(enOverride, entry.path, entry.en);
      setIn(zhOverride, entry.path, entry["zh-tw"]);
    }

    await Promise.all([
      prisma.setting.upsert({
        where: { key: "messages.en" },
        create: { key: "messages.en", value: asJson(enOverride) },
        update: { value: asJson(enOverride) },
      }),
      prisma.setting.upsert({
        where: { key: "messages.zh-tw" },
        create: { key: "messages.zh-tw", value: asJson(zhOverride) },
        update: { value: asJson(zhOverride) },
      }),
    ]);

    // 失效翻譯覆蓋快取並重建靜態頁（含所有 locale segment）
    revalidateContent(messagesTag("en"), messagesTag("zh-tw"));

    return ok({ saved: entries.length });
  } catch (error) {
    return failFromError(error);
  }
}
