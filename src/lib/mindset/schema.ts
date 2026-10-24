import { z } from "zod";
export const reflectionSchema = z.object({ blocker: z.string().trim().max(2000), controllable: z.string().trim().max(2000), nextAction: z.string().trim().max(2000) }).strict()
  .refine(v => Boolean(v.blocker || v.controllable || v.nextAction), "至少回答一題 / Answer at least one question");
export type Reflection = z.infer<typeof reflectionSchema>;
export type ReflectionEntry = Reflection & { id: string; revision: number; createdAt: string; updatedAt: string };
export const createReflectionSchema = z.object({ requestId: z.string().uuid(), reflection: reflectionSchema }).strict();
export const editReflectionSchema = createReflectionSchema.extend({ revision: z.number().int().positive() }).strict();
export const deleteReflectionSchema = z.object({ requestId: z.string().uuid(), revision: z.number().int().positive() }).strict();
