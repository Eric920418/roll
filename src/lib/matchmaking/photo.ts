import "server-only";
import sharp from "sharp";
import { get, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { MemberError, changed } from "@/lib/member-http";
import { requestHash } from "./service";

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
function privateToken() {
  const token = process.env.MATCHMAKING_BLOB_READ_WRITE_TOKEN;
  if (!token || token === process.env.BLOB_READ_WRITE_TOKEN) throw new MemberError("尚未設定 Matchmaking 私人照片儲存空間，可先不放照片上線 / Matchmaking private photo storage is not configured. You can publish without a photo", 503);
  return token;
}
export async function photoBuffers(bytes: Buffer, type: string) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new MemberError("照片上限 3 MiB / Photo must be no larger than 3 MiB", 400);
  const formats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (!formats[type]) throw new MemberError("只接受 JPEG、PNG、WebP / JPEG, PNG or WebP required", 400);
  try {
    const input = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
    const metadata = await input.metadata();
    if (metadata.format !== formats[type] || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    const original = await input.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    // Downsample before blurring so the derivative never contains a recoverable sharp face.
    const small = await sharp(original).resize(16, 16, { fit: "cover", position: "centre" }).webp().toBuffer();
    const blurred = await sharp(small).resize(480, 480, { kernel: "nearest" }).blur(24).webp({ quality: 75 }).toBuffer();
    return { original, blurred };
  } catch { throw new MemberError("照片內容無效或超過 2,000 萬像素 / Invalid image or image exceeds 20 million pixels", 400); }
}
export async function savePhoto(userId: string, revision: number, requestId: string, bytes: Buffer, type: string) {
  const hash = requestHash({ action: "photo", revision, type, bytes: requestHash(bytes.toString("base64")) });
  const row = await prisma.matchmakingProfile.findUnique({ where: { userId } });
  if (!row) throw new MemberError("請先儲存卡片 / Save your card first", 400);
  if (row.lastRequestId === requestId) { if (row.lastRequestHash !== hash) throw changed(); return { saved: true }; }
  if (row.revision !== revision) throw changed();
  const token = privateToken(), buffers = await photoBuffers(bytes, type);
  const original = await put(`matchmaking/${row.id}/${requestId}-original.webp`, buffers.original, { access: "private", token, contentType: "image/webp", addRandomSuffix: true });
  const blurred = await put(`matchmaking/${row.id}/${requestId}-blurred.webp`, buffers.blurred, { access: "private", token, contentType: "image/webp", addRandomSuffix: true });
  const saved = await prisma.matchmakingProfile.updateMany({ where: { userId, revision }, data: { originalPhoto: original.pathname, blurredPhoto: blurred.pathname, revision: { increment: 1 }, lastRequestId: requestId, lastRequestHash: hash } });
  if (!saved.count) {
    const latest = await prisma.matchmakingProfile.findUnique({ where: { userId } });
    if (latest?.lastRequestId !== requestId || latest.lastRequestHash !== hash) throw changed();
  }
  return { saved: true };
}
export async function readPhoto(userId: string, id?: string, ownBlurred = false) {
  const row = id ? await prisma.matchmakingProfile.findFirst({ where: { id, visible: true, visibleFields: { has: "photo" } }, select: { blurredPhoto: true, originalPhoto: true } }) : await prisma.matchmakingProfile.findUnique({ where: { userId }, select: { blurredPhoto: true, originalPhoto: true } });
  const path = id || ownBlurred ? row?.blurredPhoto : row?.originalPhoto;
  if (!path) throw new MemberError("找不到照片 / Photo not found", 404);
  const blob = await get(path, { access: "private", token: privateToken(), useCache: false });
  if (!blob || blob.statusCode !== 200) throw new MemberError("照片暫時無法讀取 / Photo is temporarily unavailable", 502);
  return new Response(blob.stream, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
