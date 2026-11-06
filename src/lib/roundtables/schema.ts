import { z } from "zod";
import { stepIdSchema } from "@/lib/action-plan/flow/catalog";
import { dateSchema } from "@/lib/roadmap/schema";
export const LANGUAGES = ["zh-tw", "en", "ja", "ko", "other"] as const;
export const INDUSTRIES = ["all", "saas", "hardware", "biotech", "consumer", "fintech", "other"] as const;
const distinct = <T>(v: T[]) => new Set(v).size === v.length;
export const httpsUrl = z.url().max(2000).refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }, "請使用無帳密的 HTTPS 網址 / Use an HTTPS URL without credentials");
export const mentorDraftSchema = z.object({
  publicName: z.string().trim().min(2).max(100), bio: z.string().trim().min(20).max(2000),
  expertise: z.string().trim().min(10).max(2000), references: z.array(httpsUrl).min(1).max(5).refine(distinct),
  languages: z.array(z.enum(LANGUAGES)).min(1).max(5).refine(distinct),
  industries: z.array(z.enum(INDUSTRIES)).min(1).max(7).refine(distinct),
}).strict();
export const sessionDraftSchema = z.object({
  topic: z.string().trim().min(3).max(200), description: z.string().trim().min(10).max(2000),
  steps: z.array(stepIdSchema).min(1).max(16).refine(distinct), industry: z.enum(INDUSTRIES),
  languages: z.array(z.enum(LANGUAGES)).min(1).max(5).refine(distinct),
  startsAt: z.iso.datetime(), endsAt: z.iso.datetime(),
  timezone: z.string().max(100).refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }, "Invalid time zone"),
  frameworkStages: z.array(z.number().int().min(1).max(5)).max(5).refine(distinct).default([]), repeatCount: z.number().int().min(1).max(6).default(1),
  capacity: z.number().int().min(4).max(6), registrationMode: z.enum(["approval", "instant"]), meetingUrl: httpsUrl,
}).strict().refine(v => { const minutes = (Date.parse(v.endsAt) - Date.parse(v.startsAt)) / 60000; return minutes >= 30 && minutes <= 180; }, "會議須為 30–180 分鐘 / Sessions last 30–180 minutes");
export const commitmentSchema = z.object({
  title: z.string().trim().min(3).max(200), criteria: z.string().trim().min(3).max(2000), dueDate: dateSchema,
}).strict();
const id = z.string().min(1).max(200), revision = z.number().int().nonnegative();
export const roundtableMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("autoApply"), requestId:z.uuid(), name: z.string().trim().min(2).max(100), question: z.string().trim().min(3).max(2000), consent:z.literal(true), language:z.enum(LANGUAGES), timezone:z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}) }).strict(),
  z.object({ action:z.literal("prepare"), id, revision, question:z.string().trim().min(3).max(2000), share:z.boolean() }).strict(),
  z.object({ action:z.literal("feedback"), id, requestId:z.uuid(), rating:z.number().int().min(1).max(5), note:z.string().trim().max(1000) }).strict(),
  z.object({ action: z.literal("mentorApply"), revision, draft: mentorDraftSchema, consent: z.literal(true) }).strict(),
  z.object({ action: z.literal("create"), requestId: z.uuid(), draft: sessionDraftSchema }).strict(),
  z.object({ action: z.literal("edit"), id, revision, draft: sessionDraftSchema }).strict(),
  z.object({ action: z.literal("meetingLink"), id, revision, meetingUrl: httpsUrl }).strict(),
  z.object({ action: z.literal("cancel"), id, revision, reason: z.string().trim().min(3).max(2000) }).strict(),
  z.object({ action: z.literal("apply"), id, name: z.string().trim().min(2).max(100), question: z.string().trim().min(3).max(2000), consent: z.literal(true) }).strict(),
  z.object({ action: z.literal("withdraw"), id }).strict(),
  z.object({ action: z.literal("decide"), id, revision, registrationId: id, decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(3).max(2000) }).strict(),
  z.object({ action: z.literal("finish"), id, revision, entries: z.array(z.object({ registrationId: id, attendance: z.enum(["attended", "absent"]), commitment: commitmentSchema.optional() }).strict()).max(5) }).strict(),
  z.object({ action: z.literal("commitmentDone"), registrationId: id, revision, done: z.boolean() }).strict(),
]);
export type RoundtableMutation = z.infer<typeof roundtableMutationSchema>;
export const mentorReviewSchema = z.object({ id, revision, status: z.enum(["approved", "rejected", "revoked"]), note: z.string().trim().min(3).max(2000) }).strict();

export function similarEvidenceStages(stages:number[]){return !stages.length||Math.max(...stages)-Math.min(...stages)<=1;}
