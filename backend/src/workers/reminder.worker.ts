
import "dotenv/config";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import reminderQueue from "../queues/reminder.queue.js";
import emailQueue from "../queues/email.queue.js";

interface ReminderJobData {
  deadlineId: string;
}

const worker = new Worker<ReminderJobData>(
  "deadline-reminders",
  async (job: Job<ReminderJobData>) => {
    const { deadlineId } = job.data;

    const deadline = await prisma.deadline.findUnique({
      where: { id: deadlineId },
      include: {
        document: {
          include: { user: true },
        },
      },
    });

    if (!deadline) {
      console.log(`Deadline ${deadlineId} no longer exists.`);
      return;
    }

    if (deadline.status !== "PENDING") {
      console.log(`Deadline ${deadlineId} is ${deadline.status}; skipping.`);
      return;
    }

    // Build the due instant from the stored date and time.
    // This version assumes Asia/Kolkata (UTC+05:30).
    if (!deadline.time) {
      console.log(`Deadline ${deadlineId} has no time; skipping.`);
      return;
    }

    const datePart = deadline.date.toISOString().slice(0, 10);
    const localDateTime = new Date(`${datePart}T${deadline.time}:00`);
    const dueAt = new Date(localDateTime.getTime() - 330 * 60 * 1000);
    const now = new Date();

    if (now >= dueAt) {
      await prisma.deadline.updateMany({
        where: { id: deadlineId, status: "PENDING" },
        data: { status: "EXPIRED", nextReminderAt: null },
      });

      console.log(`Deadline ${deadlineId} expired.`);
      return;
    }

    const title = "Upcoming deadline";
    const message = `"${deadline.event}" is due at ${deadline.time} on ${datePart}.`;
    const existingNotification = await prisma.notification.findFirst({
      where: {
        userId: deadline.document.userId,
        deadlineId,
        title,
        message,
        createdAt: { gte: new Date(job.timestamp) },
      },
      orderBy: { createdAt: "asc" },
    });
    const notification =
      existingNotification ??
      (await prisma.notification.create({
        data: {
          userId: deadline.document.userId,
          deadlineId,
          title,
          message,
        },
      }));

    console.log(
      `${existingNotification ? "Reusing" : "Created"} in-app notification ${notification.id}`,
    );
    const emailJob = await emailQueue.add(
      "send-reminder-email",
      {
        notificationId: notification.id,
        to: deadline.document.user.email,
        subject: `ActionLens Reminder: ${deadline.event}`,
        text: `
Hello ${deadline.document.user.name},

This is a reminder about your upcoming deadline.

Deadline: ${deadline.event}
Date: ${datePart}
Time: ${deadline.time}

Please complete the required task before the deadline.

— ActionLens
  `.trim(),
      },
      {
        jobId: `deadline-reminder-email-${deadlineId}-${job.timestamp}`,
      },
    );
    console.log(`Email job ${emailJob.id} queued for deadline ${deadlineId}`);

    const nextReminderAt = new Date(
      now.getTime() + deadline.repeatIntervalMinutes * 60 * 1000,
    );

    if (nextReminderAt < dueAt) {
      const update = await prisma.deadline.updateMany({
        where: { id: deadlineId, status: "PENDING" },
        data: { nextReminderAt },
      });

      if (update.count === 1) {
        await reminderQueue.add(
          "send-deadline-reminder",
          { deadlineId },
          {
            delay: Math.max(0, nextReminderAt.getTime() - Date.now()),
            jobId: `deadline-reminder-${deadlineId}-${nextReminderAt.getTime()}`,
            removeOnComplete: true,
          },
        );

        console.log(`Next reminder scheduled for ${nextReminderAt.toISOString()}`);
      } else {
        console.log(`Deadline ${deadlineId} is no longer pending; not rescheduling.`);
      }
    } else {
      await prisma.deadline.updateMany({
        where: { id: deadlineId, status: "PENDING" },
        data: { nextReminderAt: null },
      });

      console.log(`No more reminders before deadline ${deadlineId}.`);
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
  },
);

worker.on("completed", (job) => {
  console.log(`Reminder job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`Reminder job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("Reminder worker error:", error);
});

console.log("🔔 Deadline reminder worker is running...");
