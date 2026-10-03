import { checkRateLimit, clientIp, MINUTE_MS } from "@/lib/rate-limit";
import { browserMutationGuard } from "@/lib/security/http";
import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, failFromError, rateLimited } from "@/lib/api";
import { contactSchema } from "@/lib/cms/validation";

// 公開端點（不在 /api/admin 下，proxy 不擋）
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true);
  if (blocked) return blocked;
  try {
    const parsed = contactSchema.safeParse(await req.json());
    if (!parsed.success) {
      return fail(parsed.error.issues.map((i) => i.message).join("；"), 400);
    }
    const { name, email, message, locale, company } = parsed.data;

    // honeypot：機器人才會填 company，真人留空。靜默回成功不寫入。
    if (company && company.trim() !== "") {
      return ok({ received: true });
    }

    const limit = await checkRateLimit(`contact:${clientIp(req)}`, 10, 15 * MINUTE_MS);
    if (!limit.ok) return rateLimited(limit.retryAfterMs);
    await prisma.contactMessage.create({
      data: { name, email, message, locale: locale ?? null },
    });
    return ok({ received: true }, 201);
  } catch (error) {
    return failFromError(error);
  }
}
