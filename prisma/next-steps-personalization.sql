-- Additive only: existing plans and progress remain untouched.
ALTER TABLE "ActionPlan" ADD COLUMN IF NOT EXISTS "personalization" JSONB;
