import { z } from "zod";
import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { CATEGORIES } from "@/lib/matchmaking/schema";
import { listCards } from "@/lib/matchmaking/service";
export async function GET(req: Request) {
  try {
    const uid = await memberAccess(); if (uid instanceof Response) return uid;
    const params = new URL(req.url).searchParams;
    const category = z.enum(["all", ...CATEGORIES]).parse(params.get("category") || "all");
    const page = z.coerce.number().int().min(1).max(10000).parse(params.get("page") || 1);
    return privateOk(await listCards(uid, category, page));
  } catch (error) { return memberError(error); }
}
