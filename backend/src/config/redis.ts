
import Redis from "ioredis";

const redis = new Redis({
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

export default redis;