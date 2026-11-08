import { runReportDeliveries } from "@/lib/reports/service";
import { runNewsletter } from "@/lib/newsletter/service";
import { runEvidenceReminders } from "@/lib/evidence/reminders";
import { timingSafeEqual } from "node:crypto";
import { runNotifications } from "@/lib/network/notifications";
import { memberError, privateOk } from "@/lib/member-http";
export const maxDuration = 300;
export async function GET(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(req.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try { const deadline = Date.now() + 270000; const evidence = await runEvidenceReminders(); const reports = await runReportDeliveries(new Date(), Math.max(0, Math.min(45000, deadline - Date.now()))); const newsletter = await runNewsletter(new Date(), Math.max(0, Math.min(70000, deadline - Date.now()))); return privateOk({ ...(await runNotifications(new Date(), Math.max(0, deadline - Date.now()))), evidence, newsletter, reports }); } catch (error) { return memberError(error); }
}
