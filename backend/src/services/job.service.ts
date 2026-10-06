import documentQueue from "../queues/document.queue.js";

export const getJobStatus = async (jobId: string) => {
  const job = await documentQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  return {
    jobId: job.id,
    status: await job.getState(),
    progress: job.progress,
  };
};