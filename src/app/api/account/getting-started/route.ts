import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { ok, fail, failFromError, unauthorized } from "@/lib/api";
import { getGettingStarted } from "@/lib/getting-started/service";
import { GUIDE_VERSION } from "@/lib/getting-started/state";

export async function GET() {
  try { const session = await getUserSession(); if (!session) return unauthorized(); return ok(await getGettingStarted(session.uid)); }
  catch (error) { return failFromError(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    const body = z.object({ action: z.enum(["dismiss", "reopen"]) }).strict().parse(await req.json());
    await prisma.user.update({ where: { id: session.uid }, data: {
      gettingStartedVersion: GUIDE_VERSION, gettingStartedDismissedAt: body.action === "dismiss" ? new Date() : null,
    } });
    return ok(await getGettingStarted(session.uid));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return fail("引導操作無效 / Invalid guide action", 400);
    return failFromError(error);
  }
}
