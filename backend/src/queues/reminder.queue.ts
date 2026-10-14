import "dotenv/config";
import { Queue } from "bullmq";

const reminderQueue = new Queue("deadline-reminders", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
});

export default reminderQueue;
