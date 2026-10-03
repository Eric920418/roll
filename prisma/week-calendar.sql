-- CreateTable
CREATE TABLE "WeekCalendarItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'personal',
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekCalendarItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeekCalendarItem_actionId_key" ON "WeekCalendarItem"("actionId");

-- CreateIndex
CREATE INDEX "WeekCalendarItem_userId_date_deletedAt_idx" ON "WeekCalendarItem"("userId", "date", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeekCalendarItem_userId_requestId_key" ON "WeekCalendarItem"("userId", "requestId");

-- AddForeignKey
ALTER TABLE "WeekCalendarItem" ADD CONSTRAINT "WeekCalendarItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekCalendarItem" ADD CONSTRAINT "WeekCalendarItem_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

