import { timingSafeEqual } from "node:crypto";
import { expireTokens } from "@/lib/tokens/expiry";
import { grantMonthlyTokens } from "@/lib/tokens/monthly";
import { memberError } from "@/lib/member-http";
export const maxDuration = 240;
export async function GET(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(req.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try { return Response.json({ data: { expiry: await expireTokens(), monthly: await grantMonthlyTokens() } }); } catch (error) { return memberError(error); }
}
