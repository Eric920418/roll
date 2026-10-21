import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentAccount } from "@/lib/auth/account";
import { requirePlan } from "@/lib/billing/gate";
import { browserMutationGuard } from "@/lib/security/http";
import { fail, failFromError } from "@/lib/api";
import { PlanWriteError } from "@/lib/action-plan/service";
import { MAX_PROOF_BYTES, proofPath, proofToken } from "@/lib/validation/proof";
export async function POST(req: Request) {
  try {
    const body = await req.json() as HandleUploadBody;
    if (body.type !== "blob.upload-completed") { const blocked = browserMutationGuard(req, true); if (blocked) return blocked; }
    return Response.json(await handleUpload({ token: proofToken(), request: req, body,
      onBeforeGenerateToken: async pathname => {
        const blocked = browserMutationGuard(req); if (blocked) throw new PlanWriteError("上傳來源驗證失敗 / Invalid request origin", 403);
        const account = await getCurrentAccount();
        if (!account) throw new PlanWriteError("請重新登入 / Sign in again", 401);
        if (!await requirePlan("pro")) throw new PlanWriteError("升級後可上傳成交證據 / Upgrade to upload evidence", 403);
        if (!proofPath(account.id, pathname)) throw new PlanWriteError("上傳路徑無效 / Invalid upload path", 403);
        return { allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"], maximumSizeInBytes: MAX_PROOF_BYTES, addRandomSuffix: false, allowOverwrite: false };
      }, onUploadCompleted: async () => undefined,
    }));
  } catch (error) { return error instanceof PlanWriteError ? fail(error.message, error.status) : failFromError(error); }
}
