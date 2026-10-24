-- Additive only. Apply once; existing-table errors must stop the transaction.
BEGIN;

CREATE TABLE "ReferralAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "code" TEXT NOT NULL,
    "debt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "reason" TEXT,
    "paymentKey" TEXT,
    "errorRequestId" TEXT,
    "payerHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "eligibleAt" TIMESTAMP(3),
    "monthKey" TEXT,
    "slot" INTEGER,
    "grantedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralPayment" (
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT,
    "orderId" TEXT,
    "subscriptionId" TEXT,
    "payerHash" TEXT,
    "amountMinor" INTEGER,
    "currency" TEXT,
    "paidAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralPayment_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ReferralEntry" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "debtDelta" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralAccount_userId_key" ON "ReferralAccount"("userId");

CREATE UNIQUE INDEX "ReferralAccount_code_key" ON "ReferralAccount"("code");

CREATE UNIQUE INDEX "Referral_inviteeId_key" ON "Referral"("inviteeId");

CREATE UNIQUE INDEX "Referral_paymentKey_key" ON "Referral"("paymentKey");

CREATE UNIQUE INDEX "Referral_payerHash_key" ON "Referral"("payerHash");

CREATE INDEX "Referral_status_checkedAt_idx" ON "Referral"("status", "checkedAt");

CREATE UNIQUE INDEX "Referral_inviterId_monthKey_slot_key" ON "Referral"("inviterId", "monthKey", "slot");

CREATE INDEX "ReferralPayment_userId_paidAt_idx" ON "ReferralPayment"("userId", "paidAt");

CREATE INDEX "ReferralPayment_payerHash_idx" ON "ReferralPayment"("payerHash");

CREATE INDEX "ReferralEntry_accountId_createdAt_idx" ON "ReferralEntry"("accountId", "createdAt");

CREATE UNIQUE INDEX "ReferralEntry_referralId_accountId_kind_key" ON "ReferralEntry"("referralId", "accountId", "kind");

ALTER TABLE "ReferralAccount" ADD CONSTRAINT "ReferralAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "ReferralAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReferralPayment" ADD CONSTRAINT "ReferralPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReferralEntry" ADD CONSTRAINT "ReferralEntry_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReferralEntry" ADD CONSTRAINT "ReferralEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReferralAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
