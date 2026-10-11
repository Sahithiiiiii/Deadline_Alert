"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bullmq_1 = require("bullmq");
const pdf_parse_1 = require("pdf-parse");
const promises_1 = require("node:fs/promises");
const deadline_service_js_1 = require("../modules/ai/deadline.service.js");
const worker = new bullmq_1.Worker("document-processing", async (job) => {
    console.log(`📄 Job ${job.id} started (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`);
    const { documentId, fileName, userId, filePath } = job.data;
    console.log(`Document: ${fileName}`);
    console.log(`User: ${userId}`);
    console.log(`Document ID: ${documentId}`);
    // Read the PDF file from disk
    const fileBuffer = await (0, promises_1.readFile)(filePath);
    // Create the PDF parser
    const parser = new pdf_parse_1.PDFParse({
        data: new Uint8Array(fileBuffer),
    });
    try {
        // Extract text from the PDF
        const result = await parser.getText();
        const extractedText = result.text;
        const deadlineResult = await (0, deadline_service_js_1.extractDeadlines)(extractedText);
        console.log("Extracted deadlines:", JSON.stringify(deadlineResult.deadlines, null, 2));
        if (!extractedText.trim()) {
            throw new Error("No text found in the PDF");
        }
        // Update job progress
        await job.updateProgress(100);
        console.log(`✅ Job ${job.id} processed successfully`);
        console.log(`Extracted characters length: ${extractedText.length}`);
        return {
            success: true,
            documentId,
            fileName,
            userId,
            extractedTextLength: extractedText.length,
            deadlines: deadlineResult.deadlines,
            message: "PDF extraction completed",
        };
    }
    finally {
        // Release parser resources
        await parser.destroy();
    }
}, 
// Redis connection required by BullMQ
{
    connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT) || 6379,
    },
});
// Fired when a job completes successfully
worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed`);
});
// Fired when a job attempt fails
worker.on("failed", (job, error) => {
    if (!job) {
        console.error("A job failed, but its details are unavailable:", error.message);
        return;
    }
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;
    console.error(`❌ Job ${job.id} failed on attempt ${attemptsMade}/${maxAttempts}: ${error.message}`);
    if (attemptsMade < maxAttempts) {
        console.log(`🔁 Job ${job.id} will be retried. Next attempt: ${attemptsMade + 1}/${maxAttempts}`);
    }
    else {
        console.error(`🚫 Job ${job.id} exhausted all retry attempts.`);
    }
});
// Fired for worker-level errors
worker.on("error", (error) => {
    console.error("Worker error:", error);
});
console.log("🚀 Document worker is running...");
