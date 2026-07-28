import { Router } from "express";
import prisma from "../database/index.js";
import { getConfig, getRedisClient } from "../config/index.js";

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Checks database and Redis connectivity. Returns 200 when all services are healthy, 503 when degraded.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All systems healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: ok
 *                     redis:
 *                       type: string
 *                       example: ok
 *       503:
 *         description: One or more services unavailable
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
