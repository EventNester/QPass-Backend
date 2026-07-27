import "dotenv/config";
import http from "http";
import app from "./app.js";
import { getConfig, logger, systemMessages, createRedisClient, closeRedisClient } from "./config/index.js";
import prisma from "./database/index.js";
import { initSocket, closeSocket } from "./socket/socket.handler.js";

const config = getConfig();
const server = http.createServer(app);
initSocket(server);

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

async function gracefulShutdown() {
  server.close(async () => {
    try {
      await closeSocket();
      await prisma.$disconnect();
      await closeRedisClient();
      process.exit(0);
    } catch (error) {
      logger.error(systemMessages.ERROR.GENERAL.SERVER_START_FAILED, error.message);
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
