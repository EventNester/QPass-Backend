import { Router } from "express";
import prisma from "../database/index.js";
import { getConfig } from "../config/index.js";

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     description: Verifies that the API can reach PostgreSQL and Redis. Returns 200 when both are healthy, 503 when degraded.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: All dependencies healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: healthy }
 *                 timestamp: { type: string, format: date-time }
 *                 environment: { type: string, example: development }
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database: { type: string, enum: [ok, unavailable] }
 *                     redis:    { type: string, enum: [ok, unavailable] }
 *       503:
 *         description: One or more dependencies are unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: degraded }
 */
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
