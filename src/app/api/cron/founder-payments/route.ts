import { timingSafeEqual } from "node:crypto";
import { reconcileFounderPayments } from "@/lib/discovery/founder";
import { failFromError, ok } from "@/lib/api";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, actual = Buffer.from(req.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try { return ok(await reconcileFounderPayments()); } catch (error) { return failFromError(error); }
}
