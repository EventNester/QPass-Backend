import { Router } from "express";
import prisma from "../database/index.js";
import { getConfig } from "../config/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const config = getConfig();
  const checks = { database: "ok", redis: "ok" };
  let statusCode = 200;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.database = "unavailable";
    statusCode = 503;
  }

  try {
    const { getRedisClient } = await import("../config/index.js");
    const redis = getRedisClient();
    await redis.ping();
  } catch {
    checks.redis = "unavailable";
    statusCode = 503;
  }

  res.status(statusCode).json({
    status: statusCode === 200 ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    checks,
  });
});

export default router;
