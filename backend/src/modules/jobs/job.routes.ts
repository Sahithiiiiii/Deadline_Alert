import { Router } from "express";
import { getJobStatusController } from "./job.controller.js";

const router = Router();

router.get("/:jobId", getJobStatusController);

export default router;