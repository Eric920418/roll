import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/guard";
import { fail } from "@/lib/api";

// 圖片改用 Vercel Blob「client 直傳」：瀏覽器直接把檔案送到 Blob（上限遠大於
// Serverless Function 的 4.5MB body 限制），此 route 只負責簽發短期上傳 token。
//
// handleUpload 會被呼叫兩次：
//   1. blob.generate-client-token —— 由瀏覽器發起（帶 admin cookie），在此驗證管理員
//   2. blob.upload-completed —— 由 Vercel Blob 伺服器回呼（無 cookie），由 Blob 簽章驗證
// 因此 proxy.ts 必須讓 /api/admin/upload 略過 cookie 攔截，授權改在下方 onBeforeGenerateToken 內把關。

const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024; // 20MB 上限（client 直傳，不受 4.5MB 函式限制）

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return fail(
      "尚未設定 BLOB_READ_WRITE_TOKEN — 請在 Vercel 連結 Blob store 後重新部署",
      500,
    );
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // 僅允許已登入管理員取得上傳 token
        const session = await getAdminSession();
        if (!session) throw new Error("未授權，請重新登入");

        let oldUrl: string | undefined;
        if (clientPayload) {
          try {
            oldUrl = JSON.parse(clientPayload).oldUrl;
          } catch {
            /* clientPayload 非 JSON 時略過 */
          }
        }

        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          // 帶到 onUploadCompleted 供清理舊圖
          tokenPayload: JSON.stringify({ oldUrl: oldUrl ?? null }),
        };
      },
      onUploadCompleted: async ({ tokenPayload }) => {
        // 由 Blob 伺服器回呼（本機 localhost 不會觸發；正式環境才會）
        if (!tokenPayload) return;
        try {
          const { oldUrl } = JSON.parse(tokenPayload);
          if (oldUrl && String(oldUrl).includes(".public.blob.vercel-storage.com")) {
            await del(oldUrl);
          }
        } catch (e) {
          console.warn("Blob 舊圖清理失敗:", e);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    // 完整顯示錯誤訊息於前端
    return fail(error instanceof Error ? error.message : "上傳失敗", 400);
  }
}
