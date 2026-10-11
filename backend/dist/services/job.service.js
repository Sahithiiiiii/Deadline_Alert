"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobStatus = void 0;
const document_queue_js_1 = __importDefault(require("../queues/document.queue.js"));
const getJobStatus = async (jobId) => {
    const job = await document_queue_js_1.default.getJob(jobId);
    if (!job) {
        return null;
    }
    return {
        jobId: job.id,
        status: await job.getState(),
        progress: job.progress,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
    };
};
exports.getJobStatus = getJobStatus;
