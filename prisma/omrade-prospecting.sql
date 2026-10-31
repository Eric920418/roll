-- CreateTable
CREATE TABLE "ProspectingWorkspace" (
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "country" TEXT NOT NULL DEFAULT 'TW',
    "description" TEXT NOT NULL DEFAULT '',
    "omradeIcpId" TEXT,
    "omradeIcpVersion" INTEGER,
    "audienceHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectingWorkspace_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ProspectingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "poc" BOOLEAN NOT NULL DEFAULT false,
    "period" TEXT NOT NULL,
    "reservedCount" INTEGER NOT NULL,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "audienceRequest" JSONB NOT NULL,
    "audienceKey" TEXT NOT NULL,
    "audienceParentId" TEXT,
    "omradeIcpId" TEXT,
    "omradeIcpVersion" INTEGER,
    "orderKey" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerRequest" JSONB,
    "providerResult" JSONB,
    "providerRequestId" TEXT,
    "result" JSONB,
    "rejections" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectingTrialGrant" (
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectingTrialGrant_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectingOrder_providerOrderId_key" ON "ProspectingOrder"("providerOrderId");

-- CreateIndex
CREATE INDEX "ProspectingOrder_status_nextAttemptAt_idx" ON "ProspectingOrder"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ProspectingOrder_userId_period_idx" ON "ProspectingOrder"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectingOrder_userId_requestId_key" ON "ProspectingOrder"("userId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectingTrialGrant_orderId_key" ON "ProspectingTrialGrant"("orderId");

-- AddForeignKey
ALTER TABLE "ProspectingWorkspace" ADD CONSTRAINT "ProspectingWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectingOrder" ADD CONSTRAINT "ProspectingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectingTrialGrant" ADD CONSTRAINT "ProspectingTrialGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectingTrialGrant" ADD CONSTRAINT "ProspectingTrialGrant_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProspectingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

