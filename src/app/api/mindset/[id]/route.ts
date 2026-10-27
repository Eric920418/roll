import { browserMutationGuard } from "@/lib/security/http";
import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { deleteReflectionSchema, editReflectionSchema } from "@/lib/mindset/schema";
import { changeReflection, getReflection } from "@/lib/mindset/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try { const uid = await memberAccess(); if (uid instanceof Response) return uid; return privateOk(await getReflection(uid, (await params).id)); }
  catch (error) { return memberError(error); }
}
export async function PATCH(req: Request, { params }: Context) {
  const blocked = browserMutationGuard(req); if (blocked) return blocked;
  try {
    const uid = await memberAccess(true); if (uid instanceof Response) return uid;
    const input = editReflectionSchema.parse(await req.json());
    return privateOk(await changeReflection(uid, (await params).id, input.revision, input.requestId, input.reflection));
  } catch (error) { return memberError(error); }
}
export async function DELETE(req: Request, { params }: Context) {
  const blocked = browserMutationGuard(req); if (blocked) return blocked;
  try {
    const uid = await memberAccess(true); if (uid instanceof Response) return uid;
    const input = deleteReflectionSchema.parse(await req.json());
    return privateOk(await changeReflection(uid, (await params).id, input.revision, input.requestId));
  } catch (error) { return memberError(error); }
}
