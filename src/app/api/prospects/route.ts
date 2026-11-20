import { z } from "zod";
import { memberAccess, privateOk } from "@/lib/member-http";
import { prospectSnapshot } from "@/lib/prospecting/service";
import { prospectingFailure } from "@/lib/prospecting/http";
export async function GET(req: Request) {
  try { const user = await memberAccess(); if (typeof user !== "string") return user;
    const query = new URL(req.url).searchParams;
    const uuid = z.uuid().optional();
    return privateOk(await prospectSnapshot(user, uuid.parse(query.get("cursor") || undefined), uuid.parse(query.get("submissionId") || undefined)));
  } catch (error) { return prospectingFailure(error); }
}
