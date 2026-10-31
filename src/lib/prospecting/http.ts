import { z } from "zod";
import { memberError } from "@/lib/member-http";
import { ProspectingError } from "./schema";
export function prospectingFailure(error: unknown) {
  if (error instanceof ProspectingError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store", ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } });
  if (error instanceof z.ZodError) return Response.json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), code: "invalid_input" }, { status: 400 });
  return memberError(error);
}
