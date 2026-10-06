
import express from "express";
import cors from "cors";
import documentRoutes from "./modules/documents/document.routes.js";
import jobRoutes from "./modules/jobs/job.routes.js";
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "success",
    message: "ActionLens API is running",
  });
});
app.use("/api/documents", documentRoutes);
app.use("/api/jobs", jobRoutes);
export default app;