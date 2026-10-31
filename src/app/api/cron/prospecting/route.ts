import { timingSafeEqual } from "node:crypto";
import { runProspecting } from "@/lib/prospecting/worker";
import { prospectingFailure } from "@/lib/prospecting/http";
export const maxDuration = 240;
export async function GET(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(req.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try { return Response.json({ data: await runProspecting() }); } catch (error) { return prospectingFailure(error); }
}
