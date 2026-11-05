import { requireAdmin } from "@/lib/auth/guard";
import { browserMutationGuard } from "@/lib/security/http";
import { memberError, privateOk } from "@/lib/member-http";
import { unauthorized } from "@/lib/api";
import { mentorQueue, reviewMentor } from "@/lib/roundtables/service";
import { mentorReviewSchema } from "@/lib/roundtables/schema";
export async function GET() {
  try { if (!await requireAdmin()) return unauthorized(); return privateOk(await mentorQueue()); }
  catch (error) { return memberError(error); }
}
export async function PATCH(req: Request) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try { const admin = await requireAdmin(); if (!admin) return unauthorized(); return privateOk(await reviewMentor(admin.email, mentorReviewSchema.parse(await req.json()))); }
  catch (error) { return memberError(error); }
}
