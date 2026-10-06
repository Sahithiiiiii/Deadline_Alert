import type { Request, Response } from "express";
import documentQueue from "../../queues/document.queue.js";

export const createDocumentJob = async (
  req: Request,
  res: Response
) => {
  try {
    const { documentId, fileName, userId } = req.body;

    if (!documentId || !fileName || !userId) {
      return res.status(400).json({
        message: "documentId, fileName and userId are required",
      });
    }

    const job = await documentQueue.add("process-document", {
      documentId,
      fileName,
      userId,
    });

    return res.status(202).json({
      message: "Document queued successfully",
      jobId: job.id,
      status: "waiting",
    });
  } catch (error) {
    console.error("Failed to enqueue document:", error);

    return res.status(500).json({
      message: "Failed to queue document",
    });
  }
};