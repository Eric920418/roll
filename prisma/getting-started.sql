-- Additive and repeatable. No data backfill, deletion or replacement.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gettingStartedVersion" INTEGER,
ADD COLUMN IF NOT EXISTS "gettingStartedDismissedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "gettingStartedCompletedAt" TIMESTAMP(3);
COMMIT;
