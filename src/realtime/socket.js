import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { validateToken } from "../modules/auth/auth.service.js";
import { getSocketConfig } from "../config/socket.config.js";
import { logger, systemMessages } from "../config/index.js";
import { dashboardRoom, scanRoom } from "./rooms.js";
import prisma from "../database/index.js";

let io;
let pubClient;
let subClient;

async function isAuthorizedForEvent(userId, userRole, eventId) {
  if (userRole === "ADMIN") return true;

  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { ownerId: true },
  });
  if (!event) return false;
  if (event.ownerId === userId) return true;

  const assignment = await prisma.eventStaffAssignment.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { active: true },
  });
  return assignment?.active === true;
}

export async function initSocket(server) {
  const socketConfig = getSocketConfig();

  io = new Server(server, {
    cors: {
      origin: socketConfig.corsOrigin,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  try {
    const { host, port, password, database } = socketConfig.redis;
    const redisOpts = {
      socket: { host, port },
      password: password || undefined,
      database,
    };

    pubClient = createClient(redisOpts);
    subClient = pubClient.duplicate();

    const results = await Promise.allSettled([pubClient.connect(), subClient.connect()]);
    const failed = results.some((r) => r.status === "rejected");
    if (failed) {
      throw new Error("Redis client connection failed");
    }

    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Socket.IO Redis adapter connected");
  } catch (err) {
    logger.error("Socket.IO Redis adapter failed, falling back to in-memory:", err.message);
    await Promise.allSettled([pubClient?.disconnect(), subClient?.disconnect()]);
    pubClient = null;
    subClient = null;
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error(systemMessages.ERROR.AUTH.UNAUTHORIZED));
    }
    try {
      socket.user = validateToken(token);
      next();
    } catch {
      next(new Error(systemMessages.ERROR.AUTH.TOKEN_INVALID_OR_EXPIRED));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.user?.sub})`);

    socket.on("join:event", async (eventId) => {
      const authorized = await isAuthorizedForEvent(socket.user.sub, socket.user.role, eventId);
      if (!authorized) {
        logger.debug(`Socket ${socket.id} rejected join:event for ${eventId} (unauthorized)`);
        return;
      }
      const room = dashboardRoom(eventId);
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined ${room}`);
    });

    socket.on("leave:event", (eventId) => {
      const room = dashboardRoom(eventId);
      socket.leave(room);
      logger.debug(`Socket ${socket.id} left ${room}`);
    });

    socket.on("join:scan", async (eventId) => {
      const authorized = await isAuthorizedForEvent(socket.user.sub, socket.user.role, eventId);
      if (!authorized) {
        logger.debug(`Socket ${socket.id} rejected join:scan for ${eventId} (unauthorized)`);
        return;
      }
      const room = scanRoom(eventId);
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined ${room}`);
    });

    socket.on("leave:scan", (eventId) => {
      const room = scanRoom(eventId);
      socket.leave(room);
      logger.debug(`Socket ${socket.id} left ${room}`);
    });

    socket.on("disconnect", (reason) => {
      logger.info(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}

export async function closeSocket() {
  if (pubClient) {
    try { await pubClient.disconnect(); } catch (err) { logger.error("Failed to close pub Redis client", err); }
    pubClient = null;
  }
  if (subClient) {
    try { await subClient.disconnect(); } catch (err) { logger.error("Failed to close sub Redis client", err); }
    subClient = null;
  }
  if (io) {
    io.close();
    io = null;
  }
}
