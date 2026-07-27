import { getConfig } from "./index.js";

export function getSocketConfig() {
  const config = getConfig();
  return {
    corsOrigin: config.SOCKET_CORS_ORIGIN || config.CORS_ORIGIN || "*",
    redis: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      database: config.REDIS_DATABASE,
    },
  };
}
