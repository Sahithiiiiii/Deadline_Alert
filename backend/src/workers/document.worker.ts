import "dotenv/config";
import { Worker } from "bullmq";
import type { DocumentJobData } from "../queues/queue.types.js";

const worker = new Worker<DocumentJobData>(
  "document-processing",

  async (job) => {
    console.log(`Processing job: ${job.id}`);

    const { documentId, fileName, userId } = job.data;

    console.log(`Document: ${fileName}`);
    console.log(`User: ${userId}`);

    // Simulate a time-consuming operation
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log(`Document ${documentId} processed successfully`);

    return {
      success: true,
      documentId,
      message: "Document processing completed",
    };
  },

  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("Worker error:", error);
});

console.log("Document worker is running...");