import { timingSafeEqual } from "node:crypto";
import { runNotifications } from "@/lib/network/notifications";
import { memberError, privateOk } from "@/lib/member-http";
export const maxDuration = 300;
export async function GET(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(req.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try { return privateOk(await runNotifications()); } catch (error) { return memberError(error); }
}
