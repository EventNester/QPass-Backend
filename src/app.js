import express from "express";
import { getConfig, systemMessages } from "./config/index.js";
import prisma from "./database/index.js";

const config = getConfig();
const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "healthy", timestamp: new Date().toISOString(), environment: config.NODE_ENV });
  } catch {
    res.status(503).json({ status: "unhealthy", error: systemMessages.ERROR.GENERAL.DB_CONNECTION_FAILED });
  }
});

export default app;
