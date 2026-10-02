import type { NextRequest } from "next/server";
import { fail, ok, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/auth/guard";
import { requirePlan } from "@/lib/billing/gate";
import { roadmapFailure } from "@/lib/roadmap/http";
import { getRoadmap, getRoadmapHistory, patchRoadmap, runRoadmap } from "@/lib/roadmap/service";
import { roadmapPatchSchema, roadmapPostSchema } from "@/lib/roadmap/schema";
export const maxDuration = 300;
function response(data: unknown) { const res = ok(data); res.headers.set("Cache-Control", "private, no-store"); return res; }
export async function GET(req: NextRequest) {
  try { const session = await getUserSession(); if (!session) return unauthorized(); const id = req.nextUrl.searchParams.get("planId"); return response(id ? await getRoadmapHistory(session.uid, id) : await getRoadmap(session.uid)); } catch (error) { return roadmapFailure(error); }
}
export async function POST(req: NextRequest) {
  try { if (!await getUserSession()) return unauthorized(); const account = await requirePlan("pro"); if (!account) return fail("此功能需 Pro 以上方案 / Pro plan required", 403); return response(await runRoadmap(account, roadmapPostSchema.parse(await req.json()))); } catch (error) { return roadmapFailure(error); }
}
export async function PATCH(req: NextRequest) {
  try { const session = await getUserSession(); if (!session) return unauthorized(); if (!await requirePlan("pro")) return fail("此功能需 Pro 以上方案 / Pro plan required", 403); return response(await patchRoadmap(session.uid, roadmapPatchSchema.parse(await req.json()))); } catch (error) { return roadmapFailure(error); }
}
