"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});
redis.on("connect", () => {
    console.log("Connecting to Redis...");
});
redis.on("ready", () => {
    console.log("Redis is ready to use!");
});
redis.on("error", (error) => {
    console.error("Redis connection error:", error);
});
exports.default = redis;
