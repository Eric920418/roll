CREATE TABLE "TokenWallet" (
    "userId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenWallet_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "TokenReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceVersion" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TokenLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reservationId" TEXT,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "availableDelta" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TokenReservation_status_expiresAt_idx" ON "TokenReservation"("status", "expiresAt");

CREATE INDEX "TokenReservation_userId_createdAt_idx" ON "TokenReservation"("userId", "createdAt");

CREATE UNIQUE INDEX "TokenReservation_userId_requestId_key" ON "TokenReservation"("userId", "requestId");

CREATE UNIQUE INDEX "TokenReservation_kind_resourceId_resourceVersion_key" ON "TokenReservation"("kind", "resourceId", "resourceVersion");

CREATE UNIQUE INDEX "TokenLedger_eventKey_key" ON "TokenLedger"("eventKey");

CREATE INDEX "TokenLedger_userId_createdAt_id_idx" ON "TokenLedger"("userId", "createdAt", "id");

ALTER TABLE "TokenWallet" ADD CONSTRAINT "TokenWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenReservation" ADD CONSTRAINT "TokenReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenLedger" ADD CONSTRAINT "TokenLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenLedger" ADD CONSTRAINT "TokenLedger_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "TokenReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TokenWallet" ADD CONSTRAINT "TokenWallet_nonnegative" CHECK ("available" >= 0 AND "reserved" >= 0);

ALTER TABLE "TokenReservation" ADD CONSTRAINT "TokenReservation_price" CHECK (("kind" = 'invite' AND "amount" = 5) OR ("kind" = 'search' AND "amount" = 20));

ALTER TABLE "TokenReservation" ADD CONSTRAINT "TokenReservation_status" CHECK ("status" IN ('reserved','captured','released','refunded'));
