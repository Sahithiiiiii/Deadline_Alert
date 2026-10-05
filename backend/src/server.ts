
import "dotenv/config";
import app from "./app.js";
import redis from "./config/redis.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await redis.ping();
    await redis.set("actionlens:test", "Redis integration successful");
    app.listen(PORT, () => {
      console.log(`ActionLens API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    process.exit(1);
  }
}

startServer();