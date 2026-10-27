import { browserMutationGuard } from "@/lib/security/http";
import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { recordActivity } from "@/lib/matchmaking/service";
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req); if (blocked) return blocked;
  try { const uid = await memberAccess(true); if (uid instanceof Response) return uid; return privateOk(await recordActivity(uid)); }
  catch (error) { return memberError(error); }
}
