import { memberAccess, privateOk } from "@/lib/member-http";
import { browserMutationGuard } from "@/lib/security/http";
import { createProspectOrder } from "@/lib/prospecting/service";
import { orderInputSchema } from "@/lib/prospecting/schema";
import { prospectingFailure } from "@/lib/prospecting/http";
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try { const user = await memberAccess(true); if (typeof user !== "string") return user;
    return privateOk(await createProspectOrder(user, orderInputSchema.parse(await req.json())), 202);
  } catch (error) { return prospectingFailure(error); }
}
