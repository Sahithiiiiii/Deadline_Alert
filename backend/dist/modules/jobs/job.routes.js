"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const job_controller_js_1 = require("./job.controller.js");
const router = (0, express_1.Router)();
router.get("/:jobId", job_controller_js_1.getJobStatusController);
exports.default = router;
