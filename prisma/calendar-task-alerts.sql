-- AlterTable
ALTER TABLE "WeekCalendarItem" ADD COLUMN     "alertAt" TIMESTAMP(3),
ADD COLUMN     "alertLocale" TEXT,
ADD COLUMN     "alertVersion" TEXT,
ADD COLUMN     "durationMinutes" INTEGER;

-- CreateTable
CREATE TABLE "CalendarTaskAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarItemId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "payload" JSONB,
    "providerId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarTaskAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarTaskAlert_status_nextAttemptAt_idx" ON "CalendarTaskAlert"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CalendarTaskAlert_userId_createdAt_idx" ON "CalendarTaskAlert"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarTaskAlert_calendarItemId_version_key" ON "CalendarTaskAlert"("calendarItemId", "version");

-- AddForeignKey
ALTER TABLE "CalendarTaskAlert" ADD CONSTRAINT "CalendarTaskAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarTaskAlert" ADD CONSTRAINT "CalendarTaskAlert_calendarItemId_fkey" FOREIGN KEY ("calendarItemId") REFERENCES "WeekCalendarItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

