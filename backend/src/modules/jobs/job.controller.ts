import type { Request, Response } from "express";
import { getJobStatus } from "../../services/job.service.js";

export const getJobStatusController = async (
  req: Request,
  res: Response
) => {
  try {
    const { jobId } = req.params;

    if (!jobId || Array.isArray(jobId)) {
      return res.status(400).json({
        message: "jobId is required",
      });
    }

    const job = await getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({
        message: "Job not found",
      });
    }

    return res.status(200).json(job);
  } catch (error) {
    console.error("Failed to get job status:", error);

    return res.status(500).json({
      message: "Failed to get job status",
    });
  }
};