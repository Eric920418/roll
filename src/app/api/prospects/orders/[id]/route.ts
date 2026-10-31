import { z } from "zod";
import { memberAccess, privateOk } from "@/lib/member-http";
import { getProspectOrder } from "@/lib/prospecting/service";
import { prospectingFailure } from "@/lib/prospecting/http";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await memberAccess(); if (typeof user !== "string") return user;
    return privateOk(await getProspectOrder(user, z.string().uuid().parse((await context.params).id)));
  } catch (error) { return prospectingFailure(error); }
}
