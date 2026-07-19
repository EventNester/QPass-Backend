import "dotenv/config";
import http from "http";
import app from "./app.js";
import { getConfig, logger, systemMessages, createRedisClient, closeRedisClient } from "./config/index.js";
import prisma from "./database/index.js";

const config = getConfig();
const server = http.createServer(app);

server.listen(config.PORT, async () => {
  try {
    await prisma.$connect();
    createRedisClient();
    logger.info(`${systemMessages.INFO.SERVER.RUNNING} ${config.PORT}`);
  } catch (error) {
    logger.error(systemMessages.ERROR.GENERAL.SERVER_START_FAILED, error.message);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  server.close(async () => {
    await prisma.$disconnect();
    await closeRedisClient();
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  server.close(async () => {
    await prisma.$disconnect();
    await closeRedisClient();
    process.exit(0);
  });
});
