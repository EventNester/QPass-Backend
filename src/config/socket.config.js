import { getConfig } from "./index.js";
import { parseCorsOrigins } from "./cors.js";

export function getSocketConfig() {
  const config = getConfig();
  return {
    corsOrigin: parseCorsOrigins(config.SOCKET_CORS_ORIGIN || config.CORS_ORIGIN || "*"),
    redis: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      database: config.REDIS_DATABASE,
    },
  };
}
