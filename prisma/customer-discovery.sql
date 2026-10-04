-- Additive only; preserves legacy notes, saved ICP and workspaces.
ALTER TABLE "MeetingNote" ADD COLUMN IF NOT EXISTS "insight" JSONB;
ALTER TABLE "IcpWorkspace" ADD COLUMN IF NOT EXISTS "discovery" JSONB;
ALTER TABLE "ActionDependency" ADD COLUMN IF NOT EXISTS "minimumCurrent" DOUBLE PRECISION;
CREATE TABLE IF NOT EXISTS "CustomerStageOutcome" (
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "stage" TEXT NOT NULL,
 "primaryCount" INTEGER NOT NULL,
 "secondaryCount" INTEGER NOT NULL,
 "note" TEXT NOT NULL,
 "evidence" JSONB NOT NULL,
 "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("userId", "stage")
);
