import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { validateToken } from "../modules/auth/auth.service.js";
import { getSocketConfig } from "../config/socket.config.js";
import { logger } from "../config/index.js";

let io;
let pubClient;
let subClient;

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
    await Promise.allSettled([pubClient?.quit(), subClient?.quit()]);
    pubClient = null;
    subClient = null;
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }
    try {
      socket.user = validateToken(token);
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.user?.sub})`);

    socket.on("join:event", (eventId) => {
      const room = `event:${eventId}:dashboard`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined ${room}`);
    });

    socket.on("leave:event", (eventId) => {
      const room = `event:${eventId}:dashboard`;
      socket.leave(room);
      logger.debug(`Socket ${socket.id} left ${room}`);
    });

    socket.on("join:scan", (eventId) => {
      const room = `event:${eventId}:scan`;
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined ${room}`);
    });

    socket.on("leave:scan", (eventId) => {
      const room = `event:${eventId}:scan`;
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

export function emitCheckinUpdate(eventId, data) {
  if (!io) return;
  io.to(`event:${eventId}:dashboard`).emit("checkin:update", {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

export function emitRegistrationNew(eventId, data) {
  if (!io) return;
  io.to(`event:${eventId}:dashboard`).emit("registration:new", {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

export function emitScanResult(eventId, data) {
  if (!io) return;
  io.to(`event:${eventId}:scan`).emit("scan:result", data);
}

export async function closeSocket() {
  if (pubClient) {
    await pubClient.quit();
    pubClient = null;
  }
  if (subClient) {
    await subClient.quit();
    subClient = null;
  }
  if (io) {
    io.close();
    io = null;
  }
}
