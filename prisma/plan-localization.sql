CREATE TABLE "PlanLocalization" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "strings" JSONB NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  CONSTRAINT "PlanLocalization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanLocalization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlanLocalization_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlanLocalization_userId_planId_locale_sourceHash_key" ON "PlanLocalization"("userId", "planId", "locale", "sourceHash");
