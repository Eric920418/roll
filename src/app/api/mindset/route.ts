import { browserMutationGuard } from "@/lib/security/http";
import { z } from "zod";
import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { createReflectionSchema } from "@/lib/mindset/schema";
import { createReflection, listReflections } from "@/lib/mindset/service";
export async function GET(req: Request) {
  try {
    const uid = await memberAccess(); if (uid instanceof Response) return uid;
    const page = z.coerce.number().int().min(1).max(10000).parse(new URL(req.url).searchParams.get("page") || 1);
    return privateOk(await listReflections(uid, page));
  } catch (error) { return memberError(error); }
}
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req); if (blocked) return blocked;
  try {
    const uid = await memberAccess(true); if (uid instanceof Response) return uid;
    const input = createReflectionSchema.parse(await req.json());
    return privateOk(await createReflection(uid, input.requestId, input.reflection), 201);
  } catch (error) { return memberError(error); }
}
