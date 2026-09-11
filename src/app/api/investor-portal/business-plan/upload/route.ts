import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAccount } from "@/lib/auth/account";
import { getEffectivePlan } from "@/lib/billing/gate";
import { planAtLeast } from "@/lib/billing/plans";
import { fail, failFromError } from "@/lib/api";
import { getOrCreateOwnerPortal } from "@/lib/investor/portal";
import { MAX_INVESTOR_PDF_BYTES } from "@/lib/investor/pdf";

function privateToken() {
  const value = process.env.INVESTOR_BLOB_READ_WRITE_TOKEN;
  if (!value || value === process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Investor Business Plan 必須設定獨立的 Private Blob store。");
  }
  return value;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const response = await handleUpload({
      token: privateToken(),
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const account = await getCurrentAccount();
        if (!account) throw new Error("未授權，請重新登入。");
        if (!planAtLeast(getEffectivePlan(account), "business")) {
          throw new Error("Business Plan 上傳需要 Business 以上方案。");
        }
        const portal = await getOrCreateOwnerPortal(account.id);
        if (!pathname.startsWith(`investor-business-plans/${portal.id}/`) || !pathname.endsWith(".pdf")) {
          throw new Error("Business Plan 上傳路徑無效。");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_INVESTOR_PDF_BYTES,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && /未授權|需要 Business|路徑無效/.test(error.message)) {
      return fail(error.message, error.message.startsWith("未授權") ? 401 : 403);
    }
    return failFromError(error);
  }
}
