-- Additive P1 tables only. Existing rows and columns are unchanged.

CREATE TABLE "MentorCertification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "draft" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentorCertification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Roundtable" (
    "id" TEXT NOT NULL,
    "hostId" TEXT,
    "topic" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "steps" TEXT[],
    "industry" TEXT NOT NULL,
    "languages" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "registrationMode" TEXT NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "completionHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roundtable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoundtableRegistration" (
    "id" TEXT NOT NULL,
    "roundtableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "planId" TEXT,
    "stepId" TEXT,
    "attendance" TEXT NOT NULL DEFAULT 'unknown',
    "commitment" JSONB,
    "calendarItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundtableRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MentorCertification_userId_key" ON "MentorCertification"("userId");

CREATE INDEX "Roundtable_status_startsAt_idx" ON "Roundtable"("status", "startsAt");

CREATE UNIQUE INDEX "Roundtable_hostId_requestId_key" ON "Roundtable"("hostId", "requestId");

CREATE UNIQUE INDEX "RoundtableRegistration_calendarItemId_key" ON "RoundtableRegistration"("calendarItemId");

CREATE INDEX "RoundtableRegistration_roundtableId_status_createdAt_idx" ON "RoundtableRegistration"("roundtableId", "status", "createdAt");

CREATE INDEX "RoundtableRegistration_userId_createdAt_idx" ON "RoundtableRegistration"("userId", "createdAt");

CREATE UNIQUE INDEX "RoundtableRegistration_roundtableId_userId_key" ON "RoundtableRegistration"("roundtableId", "userId");

ALTER TABLE "MentorCertification" ADD CONSTRAINT "MentorCertification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Roundtable" ADD CONSTRAINT "Roundtable_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoundtableRegistration" ADD CONSTRAINT "RoundtableRegistration_roundtableId_fkey" FOREIGN KEY ("roundtableId") REFERENCES "Roundtable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoundtableRegistration" ADD CONSTRAINT "RoundtableRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoundtableRegistration" ADD CONSTRAINT "RoundtableRegistration_calendarItemId_fkey" FOREIGN KEY ("calendarItemId") REFERENCES "WeekCalendarItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
