const { validateEnv } = require("./env");
const logger = require("./logger");
const { createRedisClient, getRedisClient, closeRedisClient } = require("./redis");
const swaggerSpec = require("./swagger");
const constants = require("./constants");
const systemMessages = require("./system_messages");

let env;

function getConfig() {
  if (!env) {
    env = validateEnv();
  }
  return env;
}

module.exports = {
  getConfig,
  logger,
  createRedisClient,
  getRedisClient,
  closeRedisClient,
  swaggerSpec,
  constants,
  systemMessages,
};
