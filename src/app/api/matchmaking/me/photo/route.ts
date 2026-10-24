import { browserMutationGuard } from "@/lib/security/http";
import { z } from "zod";
import { MemberError, memberAccess, memberError, privateOk } from "@/lib/member-http";
import { MAX_PHOTO_BYTES, readPhoto, savePhoto } from "@/lib/matchmaking/photo";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try { const uid = await memberAccess(); if (uid instanceof Response) return uid; return await readPhoto(uid, undefined, new URL(req.url).searchParams.get("variant") === "blurred"); }
  catch (error) { return memberError(error); }
}
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, false); if (blocked) return blocked;
  try {
    const uid = await memberAccess(true); if (uid instanceof Response) return uid;
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) throw new MemberError("請使用圖片表單 / Image form required", 415);
    if (Number(req.headers.get("content-length")) > MAX_PHOTO_BYTES + 65536) throw new MemberError("照片上限 3 MiB / Photo must be no larger than 3 MiB", 413);
    const reader = req.body?.getReader(); if (!reader) throw new MemberError("請選擇照片 / Select a photo", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_PHOTO_BYTES + 65536) { await reader.cancel(); throw new MemberError("照片上限 3 MiB / Photo must be no larger than 3 MiB", 413); }
      chunks.push(chunk.value);
    }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": req.headers.get("content-type")! } }).formData(); }
    catch { throw new MemberError("圖片表單格式無效 / Invalid image form", 400); }
    const file = form.get("photo");
    if (!(file instanceof File) || file.size > MAX_PHOTO_BYTES) throw new MemberError("請選擇 3 MiB 以內的照片 / Select a photo no larger than 3 MiB", 400);
    const revision = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative()).parse(form.get("revision"));
    const requestId = z.string().uuid().parse(form.get("requestId"));
    return privateOk(await savePhoto(uid, revision, requestId, Buffer.from(await file.arrayBuffer()), file.type));
  } catch (error) { return memberError(error); }
}
