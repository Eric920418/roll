import { z } from "zod";
import { memberAccess, privateOk } from "@/lib/member-http";
import { browserMutationGuard } from "@/lib/security/http";
import { recheckProspectOrder } from "@/lib/prospecting/worker";
import { prospectingFailure } from "@/lib/prospecting/http";
export const maxDuration = 240;
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try { const user = await memberAccess(true); if (typeof user !== "string") return user;
    return privateOk(await recheckProspectOrder(user, z.string().uuid().parse((await context.params).id)));
  } catch (error) { return prospectingFailure(error); }
}
