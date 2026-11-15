import { timingSafeEqual } from "node:crypto";
import { runProspecting } from "@/lib/prospecting/worker";
import { prospectingFailure } from "@/lib/prospecting/http";
import { configured } from "@/lib/prospecting/client";
import { invalidateProspectingSchedule, nextProspectingWorkAt } from "@/lib/prospecting/schedule";
export const maxDuration = 240;
export async function GET(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(req.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try {
    const next = await nextProspectingWorkAt();
    if (!next || Date.parse(next) > Date.now()) {
      console.info({ event: "prospecting.cron_idle", nextWorkAt: next });
      return Response.json({ data: { enabled: configured(), processed: 0, idle: true } });
    }
    try {
      const data = await runProspecting();
      console.info({ event: "prospecting.cron_run", ...data });
      return Response.json({ data });
    } finally { invalidateProspectingSchedule(); }
  } catch (error) { return prospectingFailure(error); }
}
