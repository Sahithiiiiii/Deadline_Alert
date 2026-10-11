"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobStatusController = void 0;
const job_service_js_1 = require("../../services/job.service.js");
const getJobStatusController = async (req, res) => {
    try {
        const { jobId } = req.params;
        if (!jobId || Array.isArray(jobId)) {
            return res.status(400).json({
                message: "jobId is required",
            });
        }
        const job = await (0, job_service_js_1.getJobStatus)(jobId);
        if (!job) {
            return res.status(404).json({
                message: "Job not found",
            });
        }
        return res.status(200).json(job);
    }
    catch (error) {
        console.error("Failed to get job status:", error);
        return res.status(500).json({
            message: "Failed to get job status",
        });
    }
};
exports.getJobStatusController = getJobStatusController;
