import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { listingSchema } from "@/lib/matchmaking/schema";
import { listCards } from "@/lib/matchmaking/service";
export async function GET(req: Request) {
  try {
    const uid = await memberAccess(); if (uid instanceof Response) return uid;
    const params = new URL(req.url).searchParams;
    const filters = listingSchema.parse(Object.fromEntries(params));
    return privateOk(await listCards(uid, filters.category, filters.page, filters));
  } catch (error) { return memberError(error); }
}
