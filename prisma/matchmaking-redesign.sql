-- Additive only. Historical visits remain anonymous.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "viewerPrivacy" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nextStepsTour" JSONB;
ALTER TABLE "MatchmakingProfile" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "MemberVisit" ADD COLUMN IF NOT EXISTS "identityConsentAt" TIMESTAMP(3);
ALTER TABLE "MemberVisit" ADD COLUMN IF NOT EXISTS "identifiedAt" TIMESTAMP(3);
