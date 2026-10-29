-- CreateTable
CREATE TABLE "TrialFeedbackGrant" (
    "userId" TEXT NOT NULL,
    "trialStartsAt" TIMESTAMP(3) NOT NULL,
    "originalEndsAt" TIMESTAMP(3) NOT NULL,
    "grantedEndsAt" TIMESTAMP(3) NOT NULL,
    "aiCycleStart" TIMESTAMP(3),
    "aiCycleEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialFeedbackGrant_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "TrialFeedbackGrant" ADD CONSTRAINT "TrialFeedbackGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
