import { Queue } from "bullmq";
import type { DocumentJobData } from "./queue.types.js";


const documentQueue = new Queue<DocumentJobData>(
  "document-processing",
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);
export default documentQueue;