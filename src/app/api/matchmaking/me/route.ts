import { browserMutationGuard } from "@/lib/security/http";
import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { cardWriteSchema } from "@/lib/matchmaking/schema";
import { getMyCard, writeMyCard } from "@/lib/matchmaking/service";
export async function GET() {
  try { const uid = await memberAccess(); if (uid instanceof Response) return uid; return privateOk(await getMyCard(uid)); }
  catch (error) { return memberError(error); }
}
export async function PATCH(req: Request) {
  const blocked = browserMutationGuard(req); if (blocked) return blocked;
  try {
    const uid = await memberAccess(true); if (uid instanceof Response) return uid;
    return privateOk(await writeMyCard(uid, cardWriteSchema.parse(await req.json())));
  } catch (error) { return memberError(error); }
}
