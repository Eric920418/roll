-- Additive only. Apply once to an isolated database before production rollout.
BEGIN;
CREATE TABLE "MatchmakingProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" TEXT NOT NULL,
  "categories" TEXT[] NOT NULL,
  "country" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "slogan" TEXT NOT NULL,
  "offers" TEXT NOT NULL,
  "looksFor" TEXT NOT NULL,
  "visibleFields" TEXT[] NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT false,
  "optedInAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "lastRequestId" TEXT,
  "lastRequestHash" TEXT,
  "lastActiveAt" TIMESTAMP(3),
  "originalPhoto" TEXT,
  "blurredPhoto" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "recommended" BOOLEAN NOT NULL DEFAULT false,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "MatchmakingProfile_visible_lastActiveAt_id_idx" ON "MatchmakingProfile"("visible", "lastActiveAt", "id");
CREATE TABLE "MindsetEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "blocker" TEXT NOT NULL,
  "controllable" TEXT NOT NULL,
  "nextAction" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createRequestId" TEXT NOT NULL,
  "createRequestHash" TEXT NOT NULL,
  "lastRequestId" TEXT NOT NULL,
  "lastRequestHash" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "MindsetEntry_userId_createRequestId_key" ON "MindsetEntry"("userId", "createRequestId");
CREATE INDEX "MindsetEntry_userId_deletedAt_createdAt_id_idx" ON "MindsetEntry"("userId", "deletedAt", "createdAt", "id");
COMMIT;
