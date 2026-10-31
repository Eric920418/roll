import { z } from "zod";
export const privacyWriteSchema = z.object({ enabled: z.boolean(), revision: z.number().int().nonnegative(), requestId: z.string().uuid() }).strict();
const stored = z.object({ enabled: z.boolean(), revision: z.number().int().nonnegative(), consentAt: z.string().datetime().nullable(), requestId: z.string(), hash: z.string() });
export function privacyState(value: unknown) {
  return stored.safeParse(value).data || { enabled: false, revision: 0, consentAt: null, requestId: "", hash: "" };
}
export function identityIsCurrent(value: unknown, consentAt: Date | null, identifiedAt: Date | null) {
  const state = privacyState(value);
  return Boolean(state.enabled && state.consentAt && consentAt && identifiedAt && state.consentAt === consentAt.toISOString() && identifiedAt >= consentAt);
}
export const tourWriteSchema = z.object({ version: z.literal(1), step: z.number().int().min(0).max(3), finished: z.boolean(), revision: z.number().int().nonnegative(), requestId: z.string().uuid() }).strict();
export const tourState = (value: unknown) => z.object({ version: z.literal(1), step: z.number().int().min(0).max(3), finished: z.boolean(), revision: z.number().int().nonnegative() }).safeParse(value).data || { version: 1 as const, step: 0, finished: false, revision: 0 };
