import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CouponError, DEFAULT_COUPON_CODES } from "./coupons";
export const couponCodesKey = "billing.nova60.codes";
export const couponCodeInput = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/), enabled: z.boolean() }).strict();
const codesSchema = z.record(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/), z.boolean());
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
    const value = { ...codes, [parsed.data.code]: parsed.data.enabled };
    await tx.setting.upsert({ where: { key: couponCodesKey }, create: { key: couponCodesKey, value }, update: { value } });
    return value;
  });
}
