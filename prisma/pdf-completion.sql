-- AlterTable
ALTER TABLE "Roundtable" ADD COLUMN     "frameworkStages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "RoundtableRegistration" ADD COLUMN     "feedback" JSONB,
ADD COLUMN     "preparation" JSONB,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EvidenceWorkspace" (
    "analysis" JSONB,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "lastRequestId" TEXT,
    "lastRequestHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceWorkspace_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RoundtableMatchRequest" (
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundtableMatchRequest_pkey" PRIMARY KEY ("userId","requestId")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "nextDigestAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Taipei',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "verificationExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterDelivery" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "providerId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_nextDigestAt_idx" ON "NewsletterSubscriber"("status", "nextDigestAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterDelivery_eventKey_key" ON "NewsletterDelivery"("eventKey");

-- CreateIndex
CREATE INDEX "NewsletterDelivery_status_nextAttemptAt_idx" ON "NewsletterDelivery"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "EvidenceWorkspace" ADD CONSTRAINT "EvidenceWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundtableMatchRequest" ADD CONSTRAINT "RoundtableMatchRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "NewsletterSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
