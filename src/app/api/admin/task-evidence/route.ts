import type { NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { browserMutationGuard } from "@/lib/security/http";
import { prisma } from "@/lib/prisma";
import { salesRecordSchema } from "@/lib/validation/schema";
import { proofToken } from "@/lib/validation/proof";
import { evidenceQueue, reviewEvidence } from "@/lib/action-plan/flow/review";
import { PlanWriteError } from "@/lib/action-plan/service";
import { fail, failFromError, ok, unauthorized } from "@/lib/api";
export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return unauthorized();
  try {
    const dealId = req.nextUrl.searchParams.get("dealId"), proofId = req.nextUrl.searchParams.get("proofId");
    if (!dealId && !proofId) { const result = ok(await evidenceQueue()); result.headers.set("Cache-Control", "private, no-store"); return result; }
    const deal = await prisma.deal.findUnique({ where: { id: dealId || "" }, select: { validation: true } });
    const proof = salesRecordSchema.safeParse(deal?.validation).data?.proofs.find(p => p.id === proofId && p.review);
    if (!proof) return fail("找不到待審證據", 404);
    const file = await get(proof.pathname, { access: "private", useCache: false, token: proofToken() });
    if (!file || file.statusCode !== 200) return fail("附件不存在 / Attachment missing", 404);
    return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType, "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(proof.filename), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
  } catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}
export async function PATCH(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  const admin = await requireAdmin(); if (!admin) return unauthorized();
  try {
    const input = z.object({ dealId: z.string().min(1), proofId: z.string().uuid(), version: z.number().int().positive(), status: z.enum(["approved", "rejected"]), note: z.string().trim().min(3).max(2000) }).strict().parse(await req.json());
    return ok(await reviewEvidence(admin.email, input));
  } catch (error) {
    if (error instanceof PlanWriteError) return fail(error.message, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return fail("請提供完整核對結果與理由 / Provide the review decision and reason", 400);
    return failFromError(error);
  }
}
