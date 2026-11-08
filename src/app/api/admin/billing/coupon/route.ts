import { couponCodeInput, saveCouponCode } from "@/lib/billing/coupon-codes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { browserMutationGuard } from "@/lib/security/http";
import { ok, unauthorized, failFromError } from "@/lib/api";
import { CouponError } from "@/lib/billing/coupons";
import { couponSetupStatus, prepareCouponPlan } from "@/lib/billing/coupon-setup";
import { checkRateLimit, MINUTE_MS } from "@/lib/rate-limit";
export const maxDuration = 180;
const input = z.object({ plan: z.enum(["pro", "business"]), interval: z.enum(["month", "year"]) }).strict();
export async function GET() {
  if (!await requireAdmin()) return unauthorized();
  try { return ok(await couponSetupStatus()); } catch (error) { return failFromError(error); }
}
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  if (!await requireAdmin()) return unauthorized();
  try {
    const rate = await checkRateLimit("coupon-plan-setup", 10, MINUTE_MS);
    if (!rate.ok) throw new CouponError("方案設定請求過於頻繁，請稍後重試", "coupon_rate_limit", 429);
    const body = input.safeParse(await req.json()); if (!body.success) throw new CouponError("請選擇 SPARK／NOVA 的月繳或年繳", "coupon_invalid");
    return ok(await prepareCouponPlan(body.data.plan, body.data.interval));
  } catch (error) {
    if (error instanceof CouponError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return failFromError(error);
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  if (!await requireAdmin()) return unauthorized();
  try {
    const parsed = couponCodeInput.safeParse(await req.json());
    if (!parsed.success) throw new CouponError("代碼須為 3–32 字元英數、底線或連字號，並指定啟用狀態", "coupon_invalid");
    await saveCouponCode(parsed.data);
    return ok(await couponSetupStatus());
  } catch (error) {
    if (error instanceof CouponError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return failFromError(error);
  }
}
