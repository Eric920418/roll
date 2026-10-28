-- AlterTable
ALTER TABLE "User" ADD COLUMN     "featurePolicy" INTEGER;

-- AlterTable
ALTER TABLE "DiscoveryJourney" ADD COLUMN     "interviewsConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvestorPortal" ADD COLUMN     "fundraisingOpenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvestorInvitation" ADD COLUMN     "networkPolicy" INTEGER;

-- AlterTable
ALTER TABLE "MatchmakingProfile" ADD COLUMN     "hiddenByUserAt" TIMESTAMP(3),
ADD COLUMN     "sourcePolicy" INTEGER;

-- CreateTable
CREATE TABLE "NetworkConnection" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "acceptedAt" TIMESTAMP(3),
    "blockedBy" TEXT,
    "senderReadAt" TIMESTAMP(3),
    "recipientReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkMessage" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkShare" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "sections" TEXT[],
    "scope" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "NetworkShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorWatch" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberVisit" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberNotificationPreference" (
    "userId" TEXT NOT NULL,
    "weeklyEmail" BOOLEAN NOT NULL DEFAULT true,
    "watchEmail" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "version" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberNotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MemberNotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "payload" JSONB,
    "providerId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyFeatureGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyFeatureGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetworkConnection_pairKey_key" ON "NetworkConnection"("pairKey");

-- CreateIndex
CREATE INDEX "NetworkConnection_recipientId_status_idx" ON "NetworkConnection"("recipientId", "status");

-- CreateIndex
CREATE INDEX "NetworkConnection_senderId_status_idx" ON "NetworkConnection"("senderId", "status");

-- CreateIndex
CREATE INDEX "NetworkMessage_connectionId_createdAt_id_idx" ON "NetworkMessage"("connectionId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkMessage_senderId_requestId_key" ON "NetworkMessage"("senderId", "requestId");

-- CreateIndex
CREATE INDEX "NetworkShare_connectionId_idx" ON "NetworkShare"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkShare_ownerId_viewerId_key" ON "NetworkShare"("ownerId", "viewerId");

-- CreateIndex
CREATE INDEX "InvestorWatch_startupId_status_idx" ON "InvestorWatch"("startupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorWatch_investorId_startupId_condition_scopeKey_key" ON "InvestorWatch"("investorId", "startupId", "condition", "scopeKey");

-- CreateIndex
CREATE INDEX "MemberVisit_week_ownerId_idx" ON "MemberVisit"("week", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberVisit_viewerId_ownerId_week_key" ON "MemberVisit"("viewerId", "ownerId", "week");

-- CreateIndex
CREATE UNIQUE INDEX "MemberNotification_eventKey_key" ON "MemberNotification"("eventKey");

-- CreateIndex
CREATE INDEX "MemberNotification_userId_createdAt_id_idx" ON "MemberNotification"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MemberNotificationDelivery_notificationId_key" ON "MemberNotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "MemberNotificationDelivery_status_nextAttemptAt_idx" ON "MemberNotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyFeatureGrant_userId_feature_sourceKey_key" ON "LegacyFeatureGrant"("userId", "feature", "sourceKey");

-- AddForeignKey
ALTER TABLE "NetworkConnection" ADD CONSTRAINT "NetworkConnection_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkConnection" ADD CONSTRAINT "NetworkConnection_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkMessage" ADD CONSTRAINT "NetworkMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "NetworkConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkMessage" ADD CONSTRAINT "NetworkMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkShare" ADD CONSTRAINT "NetworkShare_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "NetworkConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkShare" ADD CONSTRAINT "NetworkShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkShare" ADD CONSTRAINT "NetworkShare_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorWatch" ADD CONSTRAINT "InvestorWatch_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "NetworkConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorWatch" ADD CONSTRAINT "InvestorWatch_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorWatch" ADD CONSTRAINT "InvestorWatch_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberVisit" ADD CONSTRAINT "MemberVisit_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberVisit" ADD CONSTRAINT "MemberVisit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotificationPreference" ADD CONSTRAINT "MemberNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotificationDelivery" ADD CONSTRAINT "MemberNotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "MemberNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyFeatureGrant" ADD CONSTRAINT "LegacyFeatureGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

