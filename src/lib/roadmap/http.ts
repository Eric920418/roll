import { z } from "zod";
import { fail, failFromError } from "@/lib/api";
import { PlanWriteError } from "@/lib/action-plan/service";
export function roadmapFailure(error: unknown) {
  if (error instanceof PlanWriteError) return fail(error.message, error.status);
  if (error instanceof z.ZodError) return fail(error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  if (error instanceof SyntaxError) return fail("無效 JSON / Invalid JSON", 400);
  return failFromError(error);
}
