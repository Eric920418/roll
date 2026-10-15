import { type NextRequest } from "next/server";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";
import { browserMutationGuard } from "@/lib/security/http";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { PlanWriteError } from "@/lib/action-plan/service";
import { createFounderCheckout, founderOfferSnapshot } from "@/lib/discovery/founder";
import { resolveBillingAppOrigin } from "@/lib/billing/config";
import { pathForLocale } from "@/lib/routes";
const input = z.object({ requestId: z.string().uuid(), locale: z.enum(["en", "zh-tw"]), prepaidYearConfirmed: z.literal(true) }).strict();
export async function GET() {
  try { const session = await getUserSession(); if (!session) return unauthorized(); return ok(await founderOfferSnapshot(session.uid)); }
  catch (error) { return failFromError(error); }
}
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const parsed = input.safeParse(await req.json()); if (!parsed.success) return fail("請確認 US$348 一次付款、使用十二個月且不自動續扣 / Confirm the US$348 one-time payment for twelve months, with no auto-renewal", 400);
    if (!(await checkRateLimit(`founder:orders:${session.uid}`, 8, DAY_MS)).ok) return fail("今日結帳嘗試已達上限，請稍後聯絡客服 / Checkout attempt limit reached; contact support", 429);
    const origin = resolveBillingAppOrigin(req.url), locale = parsed.data.locale;
    return ok(await createFounderCheckout(session.uid, parsed.data.requestId, `${origin}${pathForLocale("/dashboard/billing/founder-return", locale)}`, `${origin}${pathForLocale("/dashboard/agenda", locale)}?founderCancelled=1#discovery`));
  } catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}
