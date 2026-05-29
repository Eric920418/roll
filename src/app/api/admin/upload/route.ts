import { put, del } from "@vercel/blob";
import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";

const MAX_BYTES = 4.5 * 1024 * 1024; // Vercel server upload body 上限
// 不允許 SVG：SVG 可內嵌 <script>，上傳到公開 Blob 後直連會造成儲存型 XSS
const ALLOWED = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return fail(
        "尚未設定 BLOB_READ_WRITE_TOKEN — 請在 Vercel 連結 Blob store 後將 token 填入環境變數",
        500,
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const folder = (form.get("folder") as string) || "cms";
    const oldUrl = form.get("oldUrl") as string | null;

    if (!(file instanceof File)) return fail("請選擇要上傳的檔案", 400);
    if (!ALLOWED.includes(file.type)) {
      return fail("僅允許 JPG / PNG / GIF / WebP 圖片", 400);
    }
    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(2);
      return fail(`檔案 ${mb} MB 超過 4.5 MB 上限，請先壓縮`, 400);
    }

    const blob = await put(`${folder}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    // 清理被取代的舊圖（僅清 Vercel Blob 來源，外部 / public 路徑略過）
    if (oldUrl && oldUrl.includes(".public.blob.vercel-storage.com")) {
      del(oldUrl).catch((e) => console.warn("Blob 舊圖清理失敗:", e));
    }

    return ok({ url: blob.url });
  } catch (error) {
    return failFromError(error);
  }
}
