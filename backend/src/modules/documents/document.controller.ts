
import type { Request, Response } from "express";
import documentQueue from "../../queues/document.queue.js";
import { prisma } from "../../lib/prisma.js";
import { randomUUID } from "node:crypto";

export const createDocumentJob = async (
  req: Request,
  res: Response
) => {
  let documentId: string | undefined;

  try {
    const { fileName, userId, filePath } = req.body;
    const documentId = randomUUID();

    if (!fileName || !userId || !filePath) {
      return res.status(400).json({
        message:
          "documentId, fileName, userId and filePath are required",
      });
    }

    // 1. Create the document record in PostgreSQL.
    await prisma.document.create({
      data: {
        id: documentId,
        fileName,
        filePath,
        userId,
        status: "PROCESSING",
      },
    });

    try {
      // 2. Queue the document for background processing.
      const job = await documentQueue.add(
        "process-document",
        {
          documentId,
          fileName,
          userId,
          filePath,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        }
      );

      return res.status(202).json({
        message: "Document queued successfully",
        documentId,
        jobId: job.id,
        status: "waiting",
      });
    } catch (queueError) {
      // The database record exists, but queueing failed.
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "FAILED" },
      });

      throw queueError;
    }
  } catch (error) {
    console.error("Failed to create or queue document:", error);

    return res.status(500).json({
      message: "Failed to create or queue document",
    });
  }
};
