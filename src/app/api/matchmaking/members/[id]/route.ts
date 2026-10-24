import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { getMemberCard } from "@/lib/matchmaking/service";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const uid = await memberAccess(); if (uid instanceof Response) return uid; return privateOk(await getMemberCard(uid, (await params).id)); }
  catch (error) { return memberError(error); }
}
