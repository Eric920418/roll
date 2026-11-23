-- Additive only. Review the target database before applying. No existing data is updated.
BEGIN;
ALTER TABLE "User" ADD COLUMN "referralMonthPlan" TEXT,
 ADD COLUMN "referralMonthStartsAt" TIMESTAMP(3), ADD COLUMN "referralMonthEndsAt" TIMESTAMP(3);
CREATE TABLE "ReferralFreeMonth" (
 "id" TEXT NOT NULL PRIMARY KEY, "referralId" TEXT NOT NULL, "accountId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'available', "plan" TEXT NOT NULL, "subscriptionId" TEXT,
 "requestId" TEXT, "leaseUntil" TIMESTAMP(3), "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3),
 "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReferralFreeMonth_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ReferralFreeMonth_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ReferralAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReferralFreeMonth_referralId_accountId_key" ON "ReferralFreeMonth"("referralId", "accountId");
CREATE UNIQUE INDEX "ReferralFreeMonth_requestId_key" ON "ReferralFreeMonth"("requestId");
CREATE INDEX "ReferralFreeMonth_accountId_status_idx" ON "ReferralFreeMonth"("accountId", "status");
ALTER TABLE "RewardDelivery" ADD COLUMN "opportunityKind" TEXT;
COMMIT;
