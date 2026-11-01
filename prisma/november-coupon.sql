-- CreateTable
CREATE TABLE "BillingCouponCheckout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "billingInterval" TEXT NOT NULL,
    "regularAmountMinor" INTEGER NOT NULL,
    "firstAmountMinor" INTEGER NOT NULL,
    "paypalPlanId" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "paypalSubscriptionId" TEXT,
    "approveUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'creating',
    "consumedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCouponCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingCouponCheckout_requestId_key" ON "BillingCouponCheckout"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCouponCheckout_paypalSubscriptionId_key" ON "BillingCouponCheckout"("paypalSubscriptionId");

-- CreateIndex
CREATE INDEX "BillingCouponCheckout_userId_campaign_status_idx" ON "BillingCouponCheckout"("userId", "campaign", "status");

-- AddForeignKey
ALTER TABLE "BillingCouponCheckout" ADD CONSTRAINT "BillingCouponCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

