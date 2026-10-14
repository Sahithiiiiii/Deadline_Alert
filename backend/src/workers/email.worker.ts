
import "dotenv/config";
import { Worker } from "bullmq";
import { Resend } from "resend";
import { prisma } from "../lib/prisma.js";

interface EmailJobData {
  notificationId?: string;
  to: string;
  subject: string;
  text: string;
}

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error("RESEND_API_KEY is missing from .env");
}

const resend = new Resend(apiKey);

const worker = new Worker<EmailJobData>(
  "email-delivery",
  async (job) => {
    const { notificationId, to, subject, text } = job.data;

    if (notificationId) {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { emailSentAt: true },
      });

      if (!notification) {
        throw new Error(`Notification ${notificationId} no longer exists`);
      }

      if (notification.emailSentAt) {
        console.log(
          `Email already sent for notification ${notificationId}; skipping.`,
        );
        return { skipped: true };
      }
    }

    console.log(`Sending email for job ${job.id}`);

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "ActionLens <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
    });

    if (error) {
      console.error("Email provider error:", error.message);
      throw new Error(error.message);
    }

    if (!data?.id) {
      throw new Error("Email provider returned no delivery ID");
    }

    if (notificationId) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { emailSentAt: new Date() },
      });
    }

    console.log(`Email sent successfully. Provider ID: ${data.id}`);
    return { providerId: data.id };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
    concurrency: 5,
  },
);

worker.on("completed", (job) => {
  console.log(`Email job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Email job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("Email worker error:", error);
});

console.log("📧 Email worker is running...");
