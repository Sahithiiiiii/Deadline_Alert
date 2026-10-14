
import "dotenv/config";
import emailQueue from "./queues/email.queue.js";

async function main() {
  const to = process.env.TEST_EMAIL;

  if (!to) {
    throw new Error("TEST_EMAIL is missing from .env");
  }

  const job = await emailQueue.add("send-test-email", {
    to,
    subject: "ActionLens Email Test",
    text: "Success! ActionLens can send emails through its email queue.",
  });

  console.log("Test email job queued:", job.id);
}

main()
  .catch(console.error)
  .finally(async () => {
    await emailQueue.close();
  });
