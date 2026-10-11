"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const document_routes_js_1 = __importDefault(require("./modules/documents/document.routes.js"));
const job_routes_js_1 = __importDefault(require("./modules/jobs/job.routes.js"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "success",
        message: "ActionLens API is running",
    });
});
app.use("/api/documents", document_routes_js_1.default);
app.use("/api/jobs", job_routes_js_1.default);
exports.default = app;
