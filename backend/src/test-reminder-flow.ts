import "dotenv/config";
import { randomUUID } from "node:crypto";
import { QueueEvents } from "bullmq";
import { prisma } from "./lib/prisma.js";
import emailQueue from "./queues/email.queue.js";
import reminderQueue from "./queues/reminder.queue.js";
import { scheduleReminder } from "./modules/reminders/reminder.scheduler.js";

const testEmail = process.env.TEST_EMAIL;

if (!testEmail) {
  throw new Error("TEST_EMAIL is missing from .env");
}

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};
const reminderEvents = new QueueEvents("deadline-reminders", { connection });
const emailEvents = new QueueEvents("email-delivery", { connection });
const reminderCompletions = new Set<string>();
const reminderFailures = new Map<string, string>();
const emailCompletions = new Map<string, unknown>();
const emailFailures = new Map<string, string>();

reminderEvents.on("completed", ({ jobId }) => reminderCompletions.add(jobId));
reminderEvents.on("failed", ({ jobId, failedReason }) =>
  reminderFailures.set(jobId, failedReason),
);
emailEvents.on("completed", ({ jobId, returnvalue }) =>
  emailCompletions.set(jobId, returnvalue),
);
emailEvents.on("failed", ({ jobId, failedReason }) =>
  emailFailures.set(jobId, failedReason),
);

let testDocumentId: string | undefined;
let testUserId: string | undefined;
let ownsTestUser = false;
let testDeadlineId: string | undefined;
let reminderJobId: string | undefined;
let emailJobId: string | undefined;

function describeRunnableCounts(counts: Record<string, number>) {
  const runnableStates = new Set([
    "active",
    "delayed",
    "paused",
    "prioritized",
    "waiting",
    "waiting-children",
  ]);

  return Object.entries(counts)
    .filter(([state, count]) => runnableStates.has(state) && count > 0)
    .map(([state, count]) => `${state}=${count}`)
    .join(", ");
}

async function waitUntil(
  predicate: () => boolean,
  description: string,
  timeoutMs = 90_000,
) {
  const endAt = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= endAt) {
      throw new Error(`Timed out waiting for ${description}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function removeTestJobs() {
  if (reminderJobId) {
    const job = await reminderQueue.getJob(reminderJobId);
    if (job) {
      const state = await job.getState();
      if (state !== "active") {
        await job.remove();
      }
    }
  }

  if (testDeadlineId) {
    const deadline = await prisma.deadline.findUnique({
      where: { id: testDeadlineId },
      select: { nextReminderAt: true },
    });

    if (deadline?.nextReminderAt) {
      const nextJobId = `deadline-reminder-${testDeadlineId}-${deadline.nextReminderAt.getTime()}`;
      const nextJob = await reminderQueue.getJob(nextJobId);
      if (nextJob && (await nextJob.getState()) !== "active") {
        await nextJob.remove();
      }
    }
  }

  if (emailJobId) {
    const job = await emailQueue.getJob(emailJobId);
    if (job && (await job.getState()) !== "active") {
      await job.remove();
    }
  }
}

async function main() {
  if (!testEmail) {
    throw new Error("TEST_EMAIL is missing from .env");
  }

  await Promise.all([
    reminderEvents.waitUntilReady(),
    emailEvents.waitUntilReady(),
  ]);

  const [reminderCounts, emailCounts] = await Promise.all([
    reminderQueue.getJobCounts(),
    emailQueue.getJobCounts(),
  ]);

  const pendingReminderCounts = describeRunnableCounts(reminderCounts);
  if (pendingReminderCounts) {
    throw new Error(
      `Refusing to test with runnable reminder jobs (${pendingReminderCounts}); no existing jobs were changed.`,
    );
  }

  const pendingEmailCounts = describeRunnableCounts(emailCounts);
  if (pendingEmailCounts) {
    throw new Error(
      `Refusing to test with runnable email jobs (${pendingEmailCounts}); no existing jobs were changed.`,
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: testEmail },
  });
  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        name: "ActionLens reminder integration test",
        email: testEmail,
        passwordHash: randomUUID(),
      },
    }));
  testUserId = user.id;
  ownsTestUser = !existingUser;

  const token = randomUUID();
  const document = await prisma.document.create({
    data: {
      fileName: `reminder-integration-${token}.txt`,
      filePath: `test-only://${token}`,
      extractedText: "Temporary reminder integration test record.",
      status: "COMPLETED",
      userId: user.id,
    },
  });
  testDocumentId = document.id;

  const dueAt = new Date(Date.now() + 90 * 60 * 1000);
  const workerLocalDueAt = new Date(dueAt.getTime() + 330 * 60 * 1000);
  const datePart = [
    workerLocalDueAt.getFullYear(),
    String(workerLocalDueAt.getMonth() + 1).padStart(2, "0"),
    String(workerLocalDueAt.getDate()).padStart(2, "0"),
  ].join("-");
  const time = `${String(workerLocalDueAt.getHours()).padStart(2, "0")}:${String(
    workerLocalDueAt.getMinutes(),
  ).padStart(2, "0")}`;
  const deadline = await prisma.deadline.create({
    data: {
      event: `Reminder integration test ${token}`,
      date: new Date(`${datePart}T00:00:00.000Z`),
      time,
      timezone: "Asia/Kolkata",
      evidence: "Temporary test record; no real document was processed.",
      confidence: 1,
      repeatIntervalMinutes: 30,
      nextReminderAt: new Date(Date.now() + 30_000),
      documentId: document.id,
    },
  });
  testDeadlineId = deadline.id;

  const scheduledReminder = await scheduleReminder({
    deadlineId: deadline.id,
    reminderAt: deadline.nextReminderAt!,
  });
  if (!scheduledReminder.id) {
    throw new Error("Scheduled reminder did not have a BullMQ job ID");
  }
  const testReminderJobId = scheduledReminder.id;
  const testEmailJobId = `deadline-reminder-email-${deadline.id}-${scheduledReminder.timestamp}`;
  reminderJobId = testReminderJobId;
  emailJobId = testEmailJobId;

  console.log(`Test deadline created: ${deadline.id}`);
  console.log(`Reminder job scheduled: ${testReminderJobId}`);
  console.log("Start the reminder and email workers now; the test reminder is due in 30 seconds.");

  await waitUntil(
    () =>
      reminderCompletions.has(testReminderJobId) ||
      reminderFailures.has(testReminderJobId),
    "reminder job completion",
  );

  if (reminderFailures.has(testReminderJobId)) {
    throw new Error(
      `Reminder job failed: ${reminderFailures.get(testReminderJobId)}`,
    );
  }
  console.log("Reminder job processed: completed");

  const emailEndAt = Date.now() + 90_000;
  while (!emailCompletions.has(testEmailJobId)) {
    const job = await emailQueue.getJob(testEmailJobId);
    if (job && (await job.getState()) === "failed") {
      throw new Error(
        `Email job failed after its configured attempts: ${emailFailures.get(testEmailJobId) ?? "unknown error"}`,
      );
    }
    if (Date.now() >= emailEndAt) {
      throw new Error(
        `Timed out waiting for email job completion${emailFailures.has(testEmailJobId) ? `; last error: ${emailFailures.get(testEmailJobId)}` : ""}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const completedEmailResult = emailCompletions.get(testEmailJobId);
  const emailResult: unknown =
    typeof completedEmailResult === "string"
      ? JSON.parse(completedEmailResult)
      : completedEmailResult;
  if (
    !emailResult ||
    typeof emailResult !== "object" ||
    !("providerId" in emailResult) ||
    typeof emailResult.providerId !== "string"
  ) {
    throw new Error("Email worker completed without a Resend provider ID");
  }
  console.log(`Email job processed: completed (${testEmailJobId})`);
  console.log(`Resend API accepted email; provider ID: ${emailResult.providerId}`);

  const notifications = await prisma.notification.findMany({
    where: { deadlineId: deadline.id },
    orderBy: { createdAt: "asc" },
  });
  if (notifications.length !== 1) {
    throw new Error(
      `Expected exactly one in-app notification, found ${notifications.length}`,
    );
  }
  const [notification] = notifications;
  if (!notification) {
    throw new Error("Expected in-app notification was not created");
  }
  if (!notification.emailSentAt) {
    throw new Error("Email job completed but emailSentAt was not recorded");
  }
  console.log(`PostgreSQL notification created: ${notification.id}`);
  console.log(`Email sent at: ${notification.emailSentAt.toISOString()}`);

  const updatedDeadline = await prisma.deadline.findUniqueOrThrow({
    where: { id: deadline.id },
    select: { nextReminderAt: true, repeatIntervalMinutes: true },
  });
  if (!updatedDeadline.nextReminderAt) {
    throw new Error("Expected nextReminderAt was not recorded");
  }

  const nextJobId = `deadline-reminder-${deadline.id}-${updatedDeadline.nextReminderAt.getTime()}`;
  const nextJob = await reminderQueue.getJob(nextJobId);
  if (!nextJob || (await nextJob.getState()) !== "delayed") {
    throw new Error("Expected next reminder job was not delayed in BullMQ");
  }
  console.log(
    `Next reminder recorded: ${updatedDeadline.nextReminderAt.toISOString()} (${updatedDeadline.repeatIntervalMinutes} minutes)`,
  );
  console.log(`Next reminder queue status: ${await nextJob.getState()}`);
}

main()
  .catch((error: unknown) => {
    console.error("Reminder integration test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await removeTestJobs();
      if (testDocumentId) {
        await prisma.document.deleteMany({ where: { id: testDocumentId } });
      }
      if (ownsTestUser && testUserId) {
        const user = await prisma.user.findUnique({
          where: { id: testUserId },
          select: {
            documents: { select: { id: true }, take: 1 },
            notifications: { select: { id: true }, take: 1 },
          },
        });
        if (user && !user.documents.length && !user.notifications.length) {
          await prisma.user.deleteMany({ where: { id: testUserId } });
        } else if (user) {
          console.warn(
            "Temporary test user retained because other records now reference it.",
          );
        }
      }
      if (testDeadlineId || testDocumentId) {
        console.log("Temporary test records and reminder jobs cleaned up.");
      }
    } finally {
      await Promise.all([
        reminderEvents.close(),
        emailEvents.close(),
        reminderQueue.close(),
        emailQueue.close(),
        prisma.$disconnect(),
      ]);
    }
  });
