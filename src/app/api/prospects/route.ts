import { z } from "zod";
import { memberAccess, privateOk } from "@/lib/member-http";
import { prospectSnapshot } from "@/lib/prospecting/service";
import { prospectingFailure } from "@/lib/prospecting/http";
export async function GET(req: Request) {
  try { const user = await memberAccess(); if (typeof user !== "string") return user;
    const cursor = z.string().uuid().optional().parse(new URL(req.url).searchParams.get("cursor") || undefined);
    return privateOk(await prospectSnapshot(user, cursor));
  } catch (error) { return prospectingFailure(error); }
}
