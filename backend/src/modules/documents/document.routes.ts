import { Router } from "express";
import { createDocumentJob } from "./document.controller.js";

const router = Router();

router.post("/process", createDocumentJob);

export default router;