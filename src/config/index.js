import { validateEnv } from "./env.js";
import logger from "./logger.js";
import { createRedisClient, getRedisClient, closeRedisClient } from "./redis.js";
import swaggerSpec from "./swagger.config.js";
import constants from "./constants.js";
import systemMessages from "./system_messages.js";

let env;

export function getConfig() {
  if (!env) env = validateEnv();
  return env;
}

export { logger, createRedisClient, getRedisClient, closeRedisClient, swaggerSpec, constants, systemMessages };
