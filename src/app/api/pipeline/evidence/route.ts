import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { fail, failFromError, unauthorized } from "@/lib/api";
import { proofToken } from "@/lib/validation/proof";
import { salesRecordSchema } from "@/lib/validation/schema";
import { PlanWriteError } from "@/lib/action-plan/service";
export async function GET(req: Request) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const params = new URL(req.url).searchParams;
    const deal = await prisma.deal.findFirst({ where: { id: params.get("dealId") || "", userId: session.uid }, select: { validation: true } });
    const proof = salesRecordSchema.safeParse(deal?.validation).data?.proofs.find(p => p.id === params.get("proofId"));
    if (!proof) return fail("找不到證據 / Evidence not found", 404);
    const result = await get(proof.pathname, { access: "private", useCache: false, token: proofToken() });
    if (!result || result.statusCode !== 200) return fail("找不到附件 / Attachment not found", 404);
    return new Response(result.stream, { headers: { "Content-Type": result.blob.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(proof.filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
  } catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}
