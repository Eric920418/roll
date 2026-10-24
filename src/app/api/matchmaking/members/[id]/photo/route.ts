import { memberAccess, memberError } from "@/lib/member-http";
import { readPhoto } from "@/lib/matchmaking/photo";
export const runtime = "nodejs";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const uid = await memberAccess(); if (uid instanceof Response) return uid; return await readPhoto(uid, (await params).id); }
  catch (error) { return memberError(error); }
}
