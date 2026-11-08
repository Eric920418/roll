-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "MarketReportRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "reportLanguage" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "subscribe" BOOLEAN NOT NULL DEFAULT false,
    "timeZone" TEXT NOT NULL,
    "newsletterStatus" TEXT NOT NULL DEFAULT 'not_requested',
    "newsletterError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketReportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketReportDelivery" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
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

    CONSTRAINT "MarketReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketReportRequest_requestId_key" ON "MarketReportRequest"("requestId");

-- CreateIndex
CREATE INDEX "MarketReportRequest_createdAt_idx" ON "MarketReportRequest"("createdAt");

-- CreateIndex
CREATE INDEX "MarketReportDelivery_status_nextAttemptAt_idx" ON "MarketReportDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketReportDelivery_requestId_kind_key" ON "MarketReportDelivery"("requestId", "kind");

-- AddForeignKey
ALTER TABLE "MarketReportDelivery" ADD CONSTRAINT "MarketReportDelivery_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MarketReportRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

