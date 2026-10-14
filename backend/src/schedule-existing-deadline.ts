
import "dotenv/config";
import { prisma } from "./lib/prisma.js";
import { scheduleReminder } from "./modules/reminders/reminder.scheduler.js";

async function main() {
  // Find the existing pending deadline.
  const deadline = await prisma.deadline.findFirst({
    where: {
      status: "PENDING",
      event: {
        contains: "Submit the completed test",
      },
    },
  });

  if (!deadline) {
    throw new Error("The test deadline was not found.");
  }

  if (!deadline.time) {
    throw new Error("The deadline has no time.");
  }

  // This test script is specifically for Asia/Kolkata.
  if ((deadline.timezone || "Asia/Kolkata") !== "Asia/Kolkata") {
    throw new Error("This script supports Asia/Kolkata only.");
  }

  const datePart = deadline.date.toISOString().slice(0, 10);

  // Convert 5:00 PM IST to the correct UTC instant.
  const [hours, minutes] = deadline.time.split(":").map(Number);

  const deadlineInstant = new Date(
    `${datePart}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`,
  );

  const reminderAt = new Date(
    deadlineInstant.getTime() -
      deadline.reminderLeadMinutes * 60 * 1000,
  );

  if (reminderAt.getTime() <= Date.now()) {
    throw new Error(
      `Reminder time has passed: ${reminderAt.toISOString()}`,
    );
  }

  // Record the reminder time in PostgreSQL.
  await prisma.deadline.update({
    where: { id: deadline.id },
    data: { nextReminderAt: reminderAt },
  });

  // Add the delayed job to Redis.
  await scheduleReminder({
    deadlineId: deadline.id,
    reminderAt,
  });

  console.log("Deadline:", deadline.event);
  console.log("Due at (IST):", deadlineInstant.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  }));
  console.log("Reminder at (IST):", reminderAt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  }));
  console.log("Reminder successfully scheduled!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
