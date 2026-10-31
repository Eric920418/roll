import { browserMutationGuard } from "@/lib/security/http";
import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { getTour, writeTour } from "@/lib/network/identified-visitors";
export async function GET() { try { const uid = await memberAccess(); if (uid instanceof Response) return uid; return privateOk(await getTour(uid)); } catch (e) { return memberError(e); } }
export async function PATCH(req: Request) { const blocked = browserMutationGuard(req); if (blocked) return blocked; try { const uid = await memberAccess(true); if (uid instanceof Response) return uid; return privateOk(await writeTour(uid, await req.json())); } catch (e) { return memberError(e); } }
