"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const document_controller_js_1 = require("./document.controller.js");
const router = (0, express_1.Router)();
router.post("/process", document_controller_js_1.createDocumentJob);
exports.default = router;
