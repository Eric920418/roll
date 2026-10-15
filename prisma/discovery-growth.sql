-- AlterTable
ALTER TABLE "User" ADD COLUMN     "founderEndsAt" TIMESTAMP(3),
ADD COLUMN     "founderStartedAt" TIMESTAMP(3),
ADD COLUMN     "trialPolicy" TEXT;

-- CreateTable
CREATE TABLE "DiscoveryJourney" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "preview" JSONB,
    "previewVersion" INTEGER,
    "report" JSONB,
    "reportVersion" INTEGER,
    "analysisToken" TEXT,
    "analysisExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "requestId" TEXT NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "seat" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "reservedUntil" TIMESTAMP(3) NOT NULL,
    "captureToken" TEXT,
    "captureExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "accessEndsAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "paymentCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryJourney_userId_key" ON "DiscoveryJourney"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FounderOrder_requestId_key" ON "FounderOrder"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FounderOrder_paypalOrderId_key" ON "FounderOrder"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "FounderOrder_paypalCaptureId_key" ON "FounderOrder"("paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "FounderOrder_seat_key" ON "FounderOrder"("seat");

-- CreateIndex
CREATE INDEX "FounderOrder_userId_status_idx" ON "FounderOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "FounderOrder_status_reservedUntil_idx" ON "FounderOrder"("status", "reservedUntil");

-- AddForeignKey
ALTER TABLE "DiscoveryJourney" ADD CONSTRAINT "DiscoveryJourney_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FounderOrder" ADD CONSTRAINT "FounderOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
