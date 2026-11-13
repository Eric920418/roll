import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CouponError, DEFAULT_COUPON_CODES, couponRuleSchema, type CouponCodes } from "./coupons";
export const couponCodesKey = "billing.nova60.codes";
export const couponCodeInput = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/), enabled: z.boolean(), terms: z.object({ percentOff: z.number().int().min(1).max(99), startsAt: z.iso.datetime(), endsAt: z.iso.datetime() }).refine(v => v.startsAt < v.endsAt, "結束時間必須晚於開始時間").optional(), revision: z.number().int().nonnegative().optional() }).strict();
const codesSchema = z.record(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/), z.union([z.boolean(), couponRuleSchema]));
export async function readCouponCodes(db: { setting: { findUnique(args: { where: { key: string } }): Promise<{ value: unknown } | null> } } = prisma) {
  const row = await db.setting.findUnique({ where: { key: couponCodesKey } });
  return { ...DEFAULT_COUPON_CODES, ...(row ? codesSchema.parse(row.value) : {}) };
}
export async function saveCouponCode(input: z.infer<typeof couponCodeInput>) {
  const parsed = couponCodeInput.safeParse(input);
  if (!parsed.success) throw new CouponError("代碼須為 3–32 字元英數、底線或連字號 / Use 3–32 letters, digits, underscores or hyphens", "coupon_invalid");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('billing.nova60.codes'))::text`;
    const codes = await readCouponCodes(tx);
    if (!Object.hasOwn(codes, parsed.data.code) && Object.keys(codes).length >= 100) throw new CouponError("本活動最多 100 個代碼", "coupon_code_limit", 409);
    const previous = codes[parsed.data.code];
    let entry: CouponCodes[string] = parsed.data.enabled;
    if (parsed.data.terms) {
      const revision = typeof previous === "object" ? previous.revision : 0;
      if (parsed.data.revision !== revision) throw new CouponError("優惠已被其他操作更新，輸入保留，請重新載入比較", "coupon_setup_conflict", 409);
      const unchanged = typeof previous === "object" && previous.percentOff === parsed.data.terms.percentOff;
      entry = couponRuleSchema.parse({ ...parsed.data.terms, enabled: parsed.data.enabled, revision: revision + 1, plans: unchanged ? previous.plans : {} });
    } else if (typeof previous === "object") entry = { ...previous, enabled: parsed.data.enabled };
    if (typeof entry === "object" && entry.enabled && !["pro","business"].every(plan => ["month","year"].every(period => entry && typeof entry === "object" && Boolean(entry.plans[`${process.env.PAYPAL_ENV}:${plan}:${period}`])))) throw new CouponError("請先核對四個付款方案再啟用", "coupon_not_configured", 409);
    const value = { ...codes, [parsed.data.code]: entry };
    await tx.setting.upsert({ where: { key: couponCodesKey }, create: { key: couponCodesKey, value }, update: { value } });
    return value;
  });
}
