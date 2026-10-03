-- Additive only. No historical data backfill or deletion. Safe to repeat.
BEGIN;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "executionOrder" INTEGER,
ADD COLUMN IF NOT EXISTS "metricCurrent" INTEGER,
ADD COLUMN IF NOT EXISTS "metricTarget" INTEGER,
ADD COLUMN IF NOT EXISTS "metricUnit" TEXT;

ALTER TABLE "InvestorUpdate" ADD COLUMN IF NOT EXISTS "sourceCheckInId" TEXT;

CREATE TABLE IF NOT EXISTS "WeeklyCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionPlanId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "finding" TEXT NOT NULL DEFAULT '',
    "blockers" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendations" JSONB,
    "investorDraft" TEXT,
    "basePlanRevision" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "pendingRequestId" TEXT,
    "pendingSince" TIMESTAMP(3),
    "usageId" TEXT,
    "lastRequestId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WeeklyCheckIn_userId_weekStart_idx" ON "WeeklyCheckIn"("userId", "weekStart");

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyCheckIn_userId_actionPlanId_weekStart_key" ON "WeeklyCheckIn"("userId", "actionPlanId", "weekStart");

CREATE UNIQUE INDEX IF NOT EXISTS "InvestorUpdate_sourceCheckInId_key" ON "InvestorUpdate"("sourceCheckInId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyCheckIn_userId_fkey' AND conrelid = '"WeeklyCheckIn"'::regclass) THEN
    ALTER TABLE "WeeklyCheckIn" ADD CONSTRAINT "WeeklyCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WeeklyCheckIn_actionPlanId_fkey' AND conrelid = '"WeeklyCheckIn"'::regclass) THEN
    ALTER TABLE "WeeklyCheckIn" ADD CONSTRAINT "WeeklyCheckIn_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
