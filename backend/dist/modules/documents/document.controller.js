"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDocumentJob = void 0;
const document_queue_js_1 = __importDefault(require("../../queues/document.queue.js"));
const createDocumentJob = async (req, res) => {
    try {
        const { documentId, fileName, userId, filePath } = req.body;
        if (!documentId || !fileName || !userId || !filePath) {
            return res.status(400).json({
                message: "documentId, fileName and userId are required",
            });
        }
        const job = await document_queue_js_1.default.add("process-document", {
            documentId,
            fileName,
            userId,
            filePath,
        }, {
            attempts: 3,
            backoff: {
                type: "fixed",
                delay: 2000,
            },
        });
        return res.status(202).json({
            message: "Document queued successfully",
            jobId: job.id,
            status: "waiting",
        });
    }
    catch (error) {
        console.error("Failed to enqueue document:", error);
        return res.status(500).json({
            message: "Failed to queue document",
        });
    }
};
exports.createDocumentJob = createDocumentJob;
