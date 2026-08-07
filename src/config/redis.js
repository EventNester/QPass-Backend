import Redis from "ioredis";
import logger from "./logger.js";
import { getConfig } from "./index.js";

let redis;

function getRedisOptions() {
  const config = getConfig();
  return {
    host: config.REDIS_HOST || "localhost",
    port: config.REDIS_PORT || 6379,
    password: config.REDIS_PASSWORD || undefined,
    db: config.REDIS_DATABASE || 0,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
    maxRetriesPerRequest: 3,
  };
}

function attachHandlers(client) {
  client.on("connect", () => logger.info("Redis client connected"));
  client.on("ready", () => logger.info("Redis client ready"));
  client.on("error", (err) => logger.error("Redis client error:", err.message));
  client.on("close", () => logger.warn("Redis client connection closed"));
  return client;
}

function buildRedisClient(options = getRedisOptions()) {
  return attachHandlers(new Redis(options));
}

export function createRedisClient() {
  if (redis) return redis;

  redis = buildRedisClient();
  return redis;
}

export function getRedisClient() {
  if (!redis) redis = createRedisClient();
  return redis;
}

/**
 * Create a dedicated pub/sub client pair for the Socket.IO Redis adapter.
 * ioredis requires two distinct connections (publish + subscribe), so this
 * always returns fresh clients — never the shared singleton — and the socket
 * layer is free to close them without affecting other Redis consumers.
 *
 * @returns {{ pub: import("ioredis").Redis, sub: import("ioredis").Redis }}
 */
export function createPubSubClients() {
  const pub = buildRedisClient();
  const sub = pub.duplicate();
  return { pub, sub };
}

export async function closeRedisClient() {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info("Redis client closed");
  }
}
