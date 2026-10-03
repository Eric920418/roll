-- Additive, idempotent Rewards-only migration. No member data writes.
BEGIN;
ALTER TABLE "AiAllowance" ADD COLUMN IF NOT EXISTS "rewardBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CopilotTurn" ADD COLUMN IF NOT EXISTS "rewardOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "RewardAccount" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardAccount_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "RewardEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RewardRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RewardReminder" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "time" TEXT NOT NULL DEFAULT '09:00',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Taipei',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "tokenVersion" TEXT NOT NULL,
    "nextSendAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardReminder_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "RewardDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "reminderVersion" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "payload" JSONB,
    "providerId" TEXT,
    "lastError" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RewardEntry_userId_dayKey_kind_idx" ON "RewardEntry"("userId", "dayKey", "kind");

CREATE INDEX IF NOT EXISTS "RewardEntry_userId_createdAt_idx" ON "RewardEntry"("userId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RewardEntry_userId_eventKey_key" ON "RewardEntry"("userId", "eventKey");

CREATE INDEX IF NOT EXISTS "RewardRedemption_userId_monthKey_idx" ON "RewardRedemption"("userId", "monthKey");

CREATE UNIQUE INDEX IF NOT EXISTS "RewardRedemption_userId_requestId_key" ON "RewardRedemption"("userId", "requestId");

CREATE INDEX IF NOT EXISTS "RewardReminder_enabled_nextSendAt_idx" ON "RewardReminder"("enabled", "nextSendAt");

CREATE INDEX IF NOT EXISTS "RewardDelivery_status_nextAttemptAt_idx" ON "RewardDelivery"("status", "nextAttemptAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RewardDelivery_userId_dayKey_key" ON "RewardDelivery"("userId", "dayKey");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardAccount_userId_fkey' AND conrelid = '"RewardAccount"'::regclass) THEN
    ALTER TABLE "RewardAccount" ADD CONSTRAINT "RewardAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardEntry_userId_fkey' AND conrelid = '"RewardEntry"'::regclass) THEN
    ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardRedemption_userId_fkey' AND conrelid = '"RewardRedemption"'::regclass) THEN
    ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardReminder_userId_fkey' AND conrelid = '"RewardReminder"'::regclass) THEN
    ALTER TABLE "RewardReminder" ADD CONSTRAINT "RewardReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardDelivery_userId_fkey' AND conrelid = '"RewardDelivery"'::regclass) THEN
    ALTER TABLE "RewardDelivery" ADD CONSTRAINT "RewardDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
COMMIT;
