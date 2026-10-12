-- CreateEnum
CREATE TYPE "DeadlineStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "nextReminderAt" TIMESTAMP(3),
ADD COLUMN     "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "repeatIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "status" "DeadlineStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "deadlineId" UUID,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_deadlineId_idx" ON "Notification"("deadlineId");

-- CreateIndex
CREATE INDEX "Deadline_status_nextReminderAt_idx" ON "Deadline"("status", "nextReminderAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "Deadline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
