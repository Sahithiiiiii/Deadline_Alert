"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_js_1 = __importDefault(require("./app.js"));
const redis_js_1 = __importDefault(require("./config/redis.js"));
const PORT = process.env.PORT || 5000;
async function startServer() {
    try {
        await redis_js_1.default.ping();
        await redis_js_1.default.set("actionlens:test", "Redis integration successful");
        app_js_1.default.listen(PORT, () => {
            console.log(`ActionLens API running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to connect to Redis:", error);
        process.exit(1);
    }
}
startServer();
