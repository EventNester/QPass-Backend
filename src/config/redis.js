const Redis = require("ioredis");
const logger = require("./logger");

let redis;

function createRedisClient() {
  if (redis) {
    return redis;
  }

  const config = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DATABASE, 10) || 0,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  };

  redis = new Redis(config);
  redis.on("connect", () => {
    logger.info("Redis client connected");
  });

  redis.on("ready", () => {
    logger.info("Redis client ready");
  });

  redis.on("error", (err) => {
    logger.error("Redis client error:", err.message);
  });

  redis.on("close", () => {
    logger.warn("Redis client connection closed");
  });

  return redis;
}

function getRedisClient() {
  if (!redis) {
    redis = createRedisClient();
  }
  return redis;
}

async function closeRedisClient() {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info("Redis client closed");
  }
}

module.exports = { createRedisClient, getRedisClient, closeRedisClient };
