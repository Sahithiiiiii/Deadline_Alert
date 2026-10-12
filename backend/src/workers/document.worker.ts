
import "dotenv/config";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import type { DocumentJobData } from "../queues/queue.types.js";
import { PDFParse } from "pdf-parse";
import { readFile } from "node:fs/promises";
import { extractDeadlines } from "../modules/ai/deadline.service.js";
import { prisma } from "../lib/prisma.js";
import { scheduleReminder } from "../modules/reminders/reminder.scheduler.js";
const worker = new Worker<DocumentJobData>(
  "document-processing",

  async (job: Job<DocumentJobData>) => {
    const { documentId, fileName, userId, filePath } = job.data;

    const maxAttempts = job.opts.attempts ?? 1;
    const currentAttempt = job.attemptsMade + 1;

    console.log(
      `📄 Job ${job.id} started (attempt ${currentAttempt}/${maxAttempts})`
    );
    console.log(`Document: ${fileName}`);
    console.log(`User: ${userId}`);
    console.log(`Document ID: ${documentId}`);

    try {
      // 1. Read the PDF file.
      const fileBuffer = await readFile(filePath);

      // 2. Extract text from the PDF.
      const parser = new PDFParse({
        data: new Uint8Array(fileBuffer),
      });

      let extractedText: string;

      try {
        const result = await parser.getText();
        extractedText = result.text;
      } finally {
        await parser.destroy();
      }

      if (!extractedText.trim()) {
        throw new Error("No text found in the PDF");
      }

      console.log(
        `Extracted characters length: ${extractedText.length}`
      );

      await job.updateProgress(25);

      // 3. Extract deadlines using Gemini.
      const deadlineResult = await extractDeadlines(extractedText);

      console.log(
        "Extracted deadlines:",
        JSON.stringify(deadlineResult.deadlines, null, 2)
      );

      await job.updateProgress(65);

      // 4. Validate the dates before saving them.
      for (const deadline of deadlineResult.deadlines) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline.date)) {
          throw new Error(
            `Invalid deadline date format: ${deadline.date}`
          );
        }

        const date = new Date(
          `${deadline.date}T00:00:00.000Z`
        );

        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== deadline.date
        ) {
          throw new Error(
            `Invalid calendar date: ${deadline.date}`
          );
        }

        if (
          deadline.time !== null &&
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(deadline.time)
        ) {
          throw new Error(
            `Invalid deadline time: ${deadline.time}`
          );
        }

        if (
          !Number.isFinite(deadline.confidence) ||
          deadline.confidence < 0 ||
          deadline.confidence > 1
        ) {
          throw new Error(
            `Invalid confidence value for: ${deadline.event}`
          );
        }
      }

      // 5. Save the text and deadlines atomically.
      // If any database operation fails, the transaction rolls back.
      await prisma.$transaction(async (tx) => {
        // Replace deadlines from any previous processing attempt.
        await tx.deadline.deleteMany({
          where: { documentId },
        });

        await tx.document.update({
          where: { id: documentId },
          data: {
            extractedText,
            status: "COMPLETED",

            deadlines: {
              create: deadlineResult.deadlines.map((deadline) => ({
                event: deadline.event,
                date: new Date(
                  `${deadline.date}T00:00:00.000Z`
                ),
                time: deadline.time,
                timezone: deadline.timezone,
                evidence: deadline.evidence,
                confidence: deadline.confidence,
              })),
            },
          },
        });
      });
      const savedDeadlines = await prisma.deadline.findMany({
  where: { documentId },
});

for (const deadline of savedDeadlines) {
  if (deadline.status !== "PENDING") continue;

  if (!deadline.time) {
    console.warn(
      `Skipping reminder for "${deadline.event}": deadline time is missing.`,
    );
    continue;
  }

  const timezone = deadline.timezone || "Asia/Kolkata";

  // Parse the local deadline time in its specified timezone.
  const deadlineDateTime = new Date(
    `${deadline.date.toISOString().slice(0, 10)}T${deadline.time}:00`,
  );

  // Temporary timezone handling for Asia/Kolkata.
  // We'll make this timezone-safe for all supported timezones next.
  const deadlineInstant = new Date(
    deadlineDateTime.getTime() - 5.5 * 60 * 60 * 1000,
  );

  const reminderAt = new Date(
    deadlineInstant.getTime() -
      deadline.reminderLeadMinutes * 60 * 1000,
  );

  if (reminderAt.getTime() <= Date.now()) {
    console.warn(
      `Skipping first reminder for "${deadline.event}": reminder time has passed.`,
    );
    continue;
  }

  await prisma.deadline.update({
    where: { id: deadline.id },
    data: { nextReminderAt: reminderAt },
  });

  await scheduleReminder({
    deadlineId: deadline.id,
    reminderAt,
  });

  console.log(
    `⏰ Scheduled reminder for "${deadline.event}" at ${reminderAt.toISOString()} (${timezone})`,
  );
}

      await job.updateProgress(100);

      console.log(
        `💾 Saved ${deadlineResult.deadlines.length} deadlines for document ${documentId}`
      );
      console.log(`✅ Job ${job.id} processed successfully`);

      // 6. Return the result so it is available through BullMQ.
      return {
        success: true,
        documentId,
        fileName,
        userId,
        extractedTextLength: extractedText.length,
        deadlines: deadlineResult.deadlines,
        message: "PDF processed and deadlines saved to PostgreSQL",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error(
        `❌ Job ${job.id} failed on attempt ${currentAttempt}/${maxAttempts}: ${message}`
      );

      // Mark FAILED only when this is the final attempt.
      // Never overwrite a document that has already completed.
      const isFinalAttempt = currentAttempt >= maxAttempts;

      if (isFinalAttempt) {
        try {
          const result = await prisma.document.updateMany({
            where: {
              id: documentId,
              status: "PROCESSING",
            },
            data: {
              status: "FAILED",
            },
          });

          if (result.count === 0) {
            console.warn(
              `Document ${documentId} was not marked FAILED because it may already be completed or no longer processing.`
            );
          }

          console.error(
            `🚫 Job ${job.id} exhausted its retry attempts.`
          );
        } catch (statusError) {
          console.error(
            `Failed to update document status for ${documentId}:`,
            statusError
          );
        }
      } else {
        console.log(
          `🔁 Job ${job.id} will be retried. Next attempt: ${currentAttempt + 1}/${maxAttempts}`
        );
      }

      // BullMQ needs the error to be thrown to trigger its retry mechanism.
      throw error;
    }
  },

  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
  }
);

// Fired when a job completes successfully.
worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

// Fired when an attempt fails.
worker.on("failed", (job, error) => {
  if (!job) {
    console.error(
      "A job failed, but its details are unavailable:",
      error.message
    );
    return;
  }

  console.error(
    `Job ${job.id} failure event: ${error.message}; attempts made: ${job.attemptsMade}/${job.opts.attempts ?? 1}`
  );
});

// Fired for worker-level errors.
worker.on("error", (error) => {
  console.error("Worker error:", error);
});

console.log("🚀 Document worker is running...");
