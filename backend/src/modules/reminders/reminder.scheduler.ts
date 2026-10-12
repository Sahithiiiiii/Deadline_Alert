
import reminderQueue from "../../queues/reminder.queue.js";

interface ScheduleReminderInput {
  deadlineId: string;
  reminderAt: Date;
}

export async function scheduleReminder({
  deadlineId,
  reminderAt,
}: ScheduleReminderInput) {
  const delay = reminderAt.getTime() - Date.now();

  if (delay <= 0) {
    throw new Error("Reminder time must be in the future");
  }

  return reminderQueue.add(
    "send-deadline-reminder",
    { deadlineId },
    {
      delay,
      jobId: `deadline-reminder-${deadlineId}`,
      removeOnComplete: true,
    },
  );
}
