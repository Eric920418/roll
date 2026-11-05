import type { NextRequest } from "next/server";
import { z } from "zod";
import { browserMutationGuard } from "@/lib/security/http";
import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { roundtableMutationSchema } from "@/lib/roundtables/schema";
import { getRoundtables, myCommitments, mutateRoundtable } from "@/lib/roundtables/service";
export async function GET(req: NextRequest) {
  try {
    const user = await memberAccess(); if (user instanceof Response) return user;
    if (req.nextUrl.searchParams.get("view") === "commitments") return privateOk(await myCommitments(user));
    const id = z.string().min(1).max(200).optional().parse(req.nextUrl.searchParams.get("id") || undefined);
    return privateOk(await getRoundtables(user, id));
  } catch (error) { return memberError(error); }
}
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const user = await memberAccess(true); if (user instanceof Response) return user;
    const text = await req.text();
    if (text.length > 40000) return Response.json({ error: "內容過大 / Request too large", code: "request_too_large" }, { status: 413 });
    const input = roundtableMutationSchema.parse(JSON.parse(text));
    const id = await mutateRoundtable(user, input);
    return privateOk({ ...(await getRoundtables(user, id || undefined)), selectedId: id });
  } catch (error) { return memberError(error); }
}
